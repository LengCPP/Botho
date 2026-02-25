import {
  CommunitiesService,
  type ItemPublic,
  type LoanPublic,
  LoansService,
  ReadingLogService,
} from "@/client"
import ConfirmationModal from "@/components/Common/ConfirmationModal"
import { ItemActionsMenu } from "@/components/Common/ItemActionsMenu"
import { useColorModeValue } from "@/components/ui/color-mode"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import { getImageUrl } from "@/utils"
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  HStack,
  IconButton,
  Image,
  Text,
  VStack,
  useBreakpointValue,
} from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import type React from "react"
import { useState } from "react"
import {
  FiArrowLeft,
  FiBell,
  FiBellOff,
  FiBookOpen,
  FiBookmark,
  FiCheck,
  FiChevronRight,
  FiClock,
  FiCornerUpLeft,
  FiInfo,
  FiMaximize2,
  FiPlus,
  FiX,
} from "react-icons/fi"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "../ui/dialog"
import { FriendItemActionsMenu } from "./FriendItemActionsMenu"
import ItemExtendedInfo from "./ItemExtendedInfo"

interface ItemCardProps {
  item: ItemPublic | ItemPublic[]
  loan?: LoanPublic
  communityId?: string
  isAdmin?: boolean
  displayOwnerId?: string
  onRemoveFromCollection?: () => void
  onShowDetails?: () => void
  onReview?: (loan: LoanPublic) => void
  onLoanRequest?: (item: ItemPublic) => void
  onExtensionRequest?: (loan: LoanPublic) => void
}

const ItemCard = ({
  item: itemProp,
  loan: loanProp,
  communityId,
  isAdmin,
  onRemoveFromCollection,
  onShowDetails,
  onReview,
  onLoanRequest,
  onExtensionRequest,
}: ItemCardProps) => {
  const [isFlipped, setIsFlipped] = useState(false)
  const [showAdditionalInfo, setShowAdditionalInfo] = useState(false)
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false)
  const [isReadingLogConfirmOpen, setIsReadingLogConfirmOpen] = useState(false)
  const [itemIndex, setItemIndex] = useState(0)
  const [imgError, setImgError] = useState(false)
  const { user } = useAuth()
  const isMobile = useBreakpointValue({ base: true, md: false })
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const items = Array.isArray(itemProp) ? itemProp : [itemProp]
  const item = items[itemIndex]

  const { data: outgoingLoans } = useQuery({
    queryKey: ["loans", "outgoing"],
    queryFn: () => LoansService.readOutgoingLoanRequests({}),
    enabled: !!user,
  })

  const currentLoan =
    loanProp ||
    outgoingLoans?.data.find(
      (l) =>
        l.item_id === item.id &&
        !["REJECTED", "CANCELLED", "RETURNED"].includes(l.status),
    )

  const isPending = currentLoan?.status === "PENDING"
  const isActive = currentLoan?.status === "ACTIVE"
  const isReturnPending = currentLoan?.status === "RETURN_PENDING"

  const bgColor = useColorModeValue("accent.50", "gray.800")
  const textColor = useColorModeValue("gray.800", "gray.100")
  const borderColor = useColorModeValue("accent.200", "gray.600")

  const cancelLoanMutation = useMutation({
    mutationFn: () => LoansService.cancelLoan({ id: currentLoan!.id }),
    onSuccess: () => {
      showSuccessToast("Loan request cancelled.")
      queryClient.invalidateQueries({ queryKey: ["loans"] })
      queryClient.invalidateQueries({ queryKey: ["communityLoans"] })
    },
    onError: (err: any) => {
      showErrorToast(err.body?.detail || "Failed to cancel loan request")
    },
  })

  const signalReturnMutation = useMutation({
    mutationFn: () =>
      LoansService.signalReturn({ id: (loanProp?.id || currentLoan?.id)! }),
    onSuccess: (updatedLoan) => {
      showSuccessToast("Return signaled to owner.")
      queryClient.invalidateQueries({ queryKey: ["loans"] })
      queryClient.invalidateQueries({ queryKey: ["communityLoans"] })
      onReview?.(updatedLoan)
    },
    onError: (err: any) => {
      showErrorToast(err.body?.detail || "Failed to signal return")
    },
  })

  const { data: readingLogData } = useQuery({
    queryKey: ["reading-log-status", item.author, item.title],
    queryFn: () =>
      ReadingLogService.readReadingLog({
        author: item.author || "",
        title: item.title,
        limit: 1,
      }),
    enabled: !!item.author && !!item.title && !!user,
  })

  const readingLogEntry = readingLogData?.data[0]

  const readingLogMutation = useMutation({
    mutationFn: async () => {
      if (!readingLogEntry) {
        return ReadingLogService.createReadingLogEntry({
          requestBody: {
            author: item.author || "",
            title: item.title,
            status: "READING",
          },
        })
      }
      if (readingLogEntry.status === "READING") {
        return ReadingLogService.updateReadingLogEntry({
          id: readingLogEntry.id,
          requestBody: {
            status: "COMPLETED",
          },
        })
      }
      return null
    },
    onSuccess: (data) => {
      if (data) {
        const msg =
          data.status === "READING"
            ? "Added to Reading List"
            : "Marked as Completed"
        showSuccessToast(msg)
        queryClient.invalidateQueries({
          queryKey: ["reading-log-status", item.author, item.title],
        })
        queryClient.invalidateQueries({ queryKey: ["reading-log"] })
      }
      setIsReadingLogConfirmOpen(false)
    },
  })

  const handleReadingLogClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!readingLogEntry || readingLogEntry.status === "READING") {
      setIsReadingLogConfirmOpen(true)
    }
  }

  const handleFlip = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsFlipped(!isFlipped)
    if (isFlipped) setShowAdditionalInfo(false)
  }

  const handleNextItem = (e: React.MouseEvent) => {
    e.stopPropagation()
    setItemIndex((prev) => (prev + 1) % items.length)
  }

  const handleInfoClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isMobile) {
      setIsInfoModalOpen(true)
    } else {
      setShowAdditionalInfo(true)
    }
  }

  const handleShowDetails = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onShowDetails) {
      onShowDetails()
    }
  }

  const isOwner = item.owner_id === user?.id
  const isCommunityOwned =
    !!item.community_owner || (item as any).is_community_owned
  const canManage = isOwner || (isCommunityOwned && isAdmin)

  const isBorrowing =
    !!currentLoan &&
    currentLoan.requester_id === user?.id &&
    ["ACTIVE", "RETURN_PENDING"].includes(currentLoan.status)

  const isBook = item.item_type === "book"

  const { data: myInterestSignals } = useQuery({
    queryKey: ["my-interest-signals"],
    queryFn: () => LoansService.getMyInterestSignals({}),
    enabled: !!user,
  })
  const hasInterestSignal = myInterestSignals?.data?.some(
    (s: { id: string; item_id: string }) => s.item_id === item.id,
  )

  const signalInterestMutation = useMutation({
    mutationFn: () => LoansService.signalItemInterest({ itemId: item.id }),
    onSuccess: () => {
      showSuccessToast("Interest signaled!")
      queryClient.invalidateQueries({ queryKey: ["my-interest-signals"] })
    },
    onError: (err: any) => {
      showErrorToast(err.body?.detail || "Failed to signal interest")
    },
  })

  const cancelInterestMutation = useMutation({
    mutationFn: () => LoansService.cancelItemInterest({ itemId: item.id }),
    onSuccess: () => {
      showSuccessToast("Interest removed.")
      queryClient.invalidateQueries({ queryKey: ["my-interest-signals"] })
    },
    onError: (err: any) => {
      showErrorToast(err.body?.detail || "Failed to remove interest signal")
    },
  })

  const { data: community } = useQuery({
    queryKey: ["community", communityId],
    queryFn: () => CommunitiesService.readCommunity({ id: communityId! }),
    enabled: !!communityId,
  })

  const renderLoanAction = () => {
    if (isOwner) return null

    if (isPending) {
      return (
        <Button
          size="xs"
          width="full"
          colorPalette="red"
          variant="subtle"
          onClick={(e) => {
            e.stopPropagation()
            cancelLoanMutation.mutate()
          }}
          loading={cancelLoanMutation.isPending}
        >
          <FiX /> Cancel Request
        </Button>
      )
    }

    if (isActive) {
      return (
        <HStack width="full" gap={1}>
          <Button
            size="xs"
            flex={1}
            colorPalette="main"
            variant="solid"
            onClick={(e) => {
              e.stopPropagation()
              onExtensionRequest?.(currentLoan!)
            }}
          >
            <FiClock /> Extend
          </Button>
          <Button
            size="xs"
            flex={1}
            colorPalette="gray"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation()
              signalReturnMutation.mutate()
            }}
            loading={signalReturnMutation.isPending}
          >
            <FiCornerUpLeft /> Return
          </Button>
        </HStack>
      )
    }

    if (isReturnPending) {
      return (
        <Badge
          colorPalette="orange"
          variant="subtle"
          width="full"
          justifyContent="center"
          p={1}
        >
          Return Pending
        </Badge>
      )
    }

    // Item available
    if (item.is_available) {
      return (
        <Button
          size="xs"
          width="full"
          colorPalette="accent"
          onClick={(e) => {
            e.stopPropagation()
            onLoanRequest?.(item)
          }}
        >
          <FiBookOpen /> Request Loan
        </Button>
      )
    }

    // Item on loan — already signaled interest
    if (hasInterestSignal) {
      return (
        <Button
          size="xs"
          width="full"
          colorPalette="gray"
          variant="subtle"
          onClick={(e) => {
            e.stopPropagation()
            cancelInterestMutation.mutate()
          }}
          loading={cancelInterestMutation.isPending}
        >
          <FiBell /> Interest Signaled ✓
        </Button>
      )
    }

    // Item on loan — can signal interest
    return (
      <Button
        size="xs"
        width="full"
        colorPalette="orange"
        variant="outline"
        onClick={(e) => {
          e.stopPropagation()
          signalInterestMutation.mutate()
        }}
        loading={signalInterestMutation.isPending}
      >
        <FiBellOff /> Signal Interest
      </Button>
    )
  }

  return (
    <>
      <DialogRoot
        open={isInfoModalOpen}
        onOpenChange={(e) => setIsInfoModalOpen(e.open)}
        placement="center"
        size="lg"
        scrollBehavior="inside"
      >
        <DialogContent>
          <DialogHeader>
            <Flex justify="space-between" align="center" width="full" pr={8}>
              <DialogTitle>{item.title}</DialogTitle>
              <Box onClick={(e) => e.stopPropagation()}>
                {canManage ? (
                  <ItemActionsMenu
                    item={item}
                    communityId={communityId}
                    isAdmin={isAdmin}
                    onRemoveFromCollection={onRemoveFromCollection}
                    onlyInfo={true}
                    onShowDetails={onShowDetails}
                  />
                ) : (
                  <FriendItemActionsMenu
                    item={item}
                    isBorrowing={isBorrowing}
                    loanId={currentLoan?.id}
                    communityId={communityId}
                    community={community}
                    isAdmin={isAdmin}
                    onShowDetails={onShowDetails}
                  />
                )}
              </Box>
            </Flex>
          </DialogHeader>
          <DialogBody>
            <ItemExtendedInfo item={item} isOwner={isOwner} />
          </DialogBody>
          <DialogCloseTrigger />
        </DialogContent>
      </DialogRoot>

      <Box
        aspectRatio={isBook ? 2 / 3 : 3 / 4}
        width="100%"
        maxW="300px"
        mx="auto"
        minW="140px"
        cursor="pointer"
        perspective="1000px"
        borderRadius="lg"
        position="relative"
        data-testid="item-card"
      >
        {items.slice(1, 3).map((layerItem, idx) => (
          <Box
            key={layerItem.id}
            position="absolute"
            inset="0"
            bg={layerItem.image_url ? "black" : bgColor}
            borderRadius="lg"
            transform={`translate(${(idx + 1) * 4}px, -${
              (idx + 1) * 4
            }px) rotate(${(idx + 1) * 2}deg)`}
            zIndex={-(idx + 1)}
            opacity={idx === 0 ? 1 : 0.7}
            overflow="hidden"
          >
            {layerItem.image_url && (
              <Image
                src={getImageUrl(layerItem.image_url)}
                alt=""
                objectFit="cover"
                width="100%"
                height="100%"
                opacity={0.8}
                loading="lazy"
                onError={(e) => { e.currentTarget.style.display = "none" }}
              />
            )}
          </Box>
        ))}

        <Box
          position="relative"
          width="100%"
          height="100%"
          transition="transform 0.6s"
          transformStyle="preserve-3d"
          transform={isFlipped ? "rotateY(180deg)" : "rotateY(0deg)"}
        >
          <Card.Root
            position="absolute"
            width="100%"
            height="100%"
            backfaceVisibility="hidden"
            onClick={handleFlip}
            overflow="hidden"
            borderRadius="lg"
            borderWidth="0"
            boxShadow="md"
            bg={item.image_url && !imgError ? "black" : bgColor}
          >
            {item.image_url && !imgError ? (
              <Image
                src={getImageUrl(item.image_url)}
                alt={item.title}
                objectFit="cover"
                width="100%"
                height="100%"
                loading="lazy"
                onError={() => setImgError(true)}
              />
            ) : (
              <Flex
                direction="column"
                justify="center"
                align="center"
                height="100%"
                p={6}
                bg={bgColor}
                color={textColor}
                textAlign="center"
                borderWidth="4px"
                borderColor={borderColor}
                borderStyle="double"
              >
                <Text
                  fontSize="xl"
                  fontWeight="bold"
                  fontFamily="serif"
                  mb={2}
                  lineClamp={3}
                >
                  {item.title}
                </Text>
                {item.author && (
                  <Text fontSize="md" fontStyle="italic">
                    {item.author}
                  </Text>
                )}
              </Flex>
            )}

            {items.length > 1 && (
              <Badge
                position="absolute"
                bottom={2}
                right={2}
                colorPalette="accent"
                variant="solid"
                size="sm"
                borderRadius="full"
                px={2}
              >
                {items.length} copies
              </Badge>
            )}

            {item.author && (
              <IconButton
                aria-label="Reading Log"
                size="xs"
                position="absolute"
                top={2}
                left={2}
                colorPalette={
                  readingLogEntry
                    ? readingLogEntry.status === "COMPLETED"
                      ? "green"
                      : "blue"
                    : "gray"
                }
                variant="solid"
                onClick={handleReadingLogClick}
                zIndex={10}
                loading={readingLogMutation.isPending}
                disabled={isFlipped}
                pointerEvents={isFlipped ? "none" : "auto"}
              >
                {readingLogEntry ? (
                  readingLogEntry.status === "READING" ? (
                    <FiBookOpen />
                  ) : readingLogEntry.status === "COMPLETED" ? (
                    <FiCheck />
                  ) : (
                    <FiBookmark />
                  )
                ) : (
                  <FiPlus />
                )}
              </IconButton>
            )}
          </Card.Root>

          <Card.Root
            position="absolute"
            width="100%"
            height="100%"
            backfaceVisibility="hidden"
            transform="rotateY(180deg)"
            onClick={handleFlip}
            overflow="hidden"
            borderRadius="lg"
            boxShadow="md"
            bg={bgColor}
            color={textColor}
            borderColor={borderColor}
            opacity={!item.is_available && !isOwner ? 0.75 : 1}
            filter={!item.is_available && !isOwner ? "grayscale(30%)" : "none"}
          >
            <Card.Body
              p={4}
              height="100%"
              display="flex"
              flexDirection="column"
            >
              <Flex justify="space-between" align="start" mb={2}>
                {showAdditionalInfo ? (
                  <Badge colorPalette="purple" variant="solid" size="sm">
                    Copy Info
                  </Badge>
                ) : (
                  <Badge colorPalette="teal" variant="solid" size="sm">
                    {String(item.item_type || "General")}
                  </Badge>
                )}

                <HStack gap={1} onClick={(e) => e.stopPropagation()}>
                  {!showAdditionalInfo && onShowDetails && (
                    <IconButton
                      aria-label="Full Details"
                      size="xs"
                      variant="ghost"
                      onClick={handleShowDetails}
                    >
                      <FiMaximize2 />
                    </IconButton>
                  )}

                  {!showAdditionalInfo && (
                    <IconButton
                      aria-label="Additional Info"
                      size="xs"
                      variant="ghost"
                      onClick={handleInfoClick}
                    >
                      <FiInfo />
                    </IconButton>
                  )}

                  {showAdditionalInfo && (
                    <IconButton
                      aria-label="Back to details"
                      size="xs"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowAdditionalInfo(false)
                      }}
                    >
                      <FiArrowLeft />
                    </IconButton>
                  )}

                  {canManage ? (
                    <ItemActionsMenu
                      item={item}
                      communityId={communityId}
                      isAdmin={isAdmin}
                      onRemoveFromCollection={onRemoveFromCollection}
                      onlyInfo={showAdditionalInfo}
                      onShowDetails={onShowDetails}
                    />
                  ) : (
                    <FriendItemActionsMenu
                      item={item}
                      isBorrowing={isBorrowing}
                      loanId={currentLoan?.id}
                      communityId={communityId}
                      isAdmin={isAdmin}
                      onShowDetails={onShowDetails}
                    />
                  )}
                </HStack>
              </Flex>

              {showAdditionalInfo ? (
                <VStack align="start" gap={3} mb={3} flex="1" overflowY="auto">
                  <ItemExtendedInfo item={item} isOwner={isOwner} />
                </VStack>
              ) : (
                <VStack align="start" gap={1} mb={3} flex="1" overflow="hidden">
                  <Text fontSize="lg" fontWeight="bold" lineClamp={2}>
                    {item.title}
                  </Text>

                  {item.author && (
                    <Text
                      fontSize="sm"
                      fontStyle="italic"
                      color="gray.500"
                      lineClamp={1}
                    >
                      By {item.author}
                    </Text>
                  )}

                  <HStack gap={1} wrap="wrap" mt={1}>
                    {(item.work_metadata?.category || item.category) && (
                      <Badge variant="solid" colorPalette="blue" size="xs">
                        {item.work_metadata?.category || item.category}
                      </Badge>
                    )}
                    {(item.work_metadata?.genre || item.genre) && (
                      <Badge variant="outline" colorPalette="teal" size="xs">
                        {item.work_metadata?.genre || item.genre}
                      </Badge>
                    )}
                  </HStack>

                  {/* Subjects in Details */}
                  {(() => {
                    const rawSubjects =
                      (item.work_metadata?.tags?.length
                        ? item.work_metadata.tags
                        : null) ||
                      item.subject
                        ?.split(",")
                        .map((s: string) => s.trim())
                        .filter(Boolean) ||
                      []
                    const subjects = [...new Set(rawSubjects)]
                    const visible = subjects.slice(0, 3)
                    const extraCount = subjects.length - 3
                    return (
                      subjects.length > 0 && (
                        <Flex wrap="wrap" gap={2} mt={1}>
                          {visible.map((tag: string, i: number) => (
                            <Badge
                              key={`${i}-${tag}`}
                              variant="outline"
                              colorPalette="orange"
                              size="xs"
                            >
                              {tag}
                            </Badge>
                          ))}
                          {extraCount > 0 && (
                            <Badge variant="subtle" colorPalette="gray" size="xs">
                              +{extraCount} more
                            </Badge>
                          )}
                        </Flex>
                      )
                    )
                  })()}

                  <Box
                    mt={1}
                    flex="1"
                    overflowY="auto"
                    width="full"
                    pr={1}
                    css={{
                      "&::-webkit-scrollbar": { display: "none" },
                      scrollbarWidth: "none",
                    }}
                  >
                    <Text fontSize="xs" color="inherit" opacity={0.9} mb={2}>
                      {item.description || "No description provided."}
                    </Text>
                  </Box>
                </VStack>
              )}

              <Box
                mt="auto"
                pt={2}
                borderTopWidth="1px"
                borderColor={borderColor}
              >
                <Box mb={3}>{renderLoanAction()}</Box>

                <Flex justify="space-between" align="center" mb={1}>
                  <HStack gap={2}>
                    <Text fontSize="xs" fontWeight="semibold">
                      Owner:
                    </Text>
                    {item.is_donation_pending && (
                      <Badge colorPalette="yellow" variant="subtle" size="xs">
                        Donation Pending
                      </Badge>
                    )}
                  </HStack>
                  {items.length > 1 && (
                    <HStack gap={1}>
                      <Text fontSize="2xs" color="gray.500">
                        {itemIndex + 1}/{items.length}
                      </Text>
                      <IconButton
                        aria-label="Next Owner"
                        size="xs"
                        variant="ghost"
                        onClick={handleNextItem}
                      >
                        <FiChevronRight />
                      </IconButton>
                    </HStack>
                  )}
                </Flex>

                <HStack gap={1} flexWrap="wrap">
                  {currentLoan ? (
                    <Link
                      to={
                        currentLoan.owner?.id === user?.id
                          ? "/items"
                          : "/users/$userId"
                      }
                      params={
                        currentLoan.owner?.id === user?.id
                          ? {}
                          : { userId: currentLoan.owner?.id || "" }
                      }
                      search={{ q: item.title }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ textDecoration: "none" }}
                    >
                      <Text
                        fontSize="xs"
                        color="main.500"
                        _hover={{ textDecoration: "underline" }}
                      >
                        {currentLoan.owner
                          ? currentLoan.owner.id === user?.id
                            ? "You"
                            : String(
                                currentLoan.owner.full_name ||
                                  currentLoan.owner.email,
                              )
                          : item.community_owner?.name || "Community"}
                      </Text>
                    </Link>
                  ) : (
                    <>
                      {isCommunityOwned || item.communities?.[0] ? (
                        <Link
                          to="/communities/$communityId"
                          params={{
                            communityId:
                              item.community_owner?.id ||
                              item.communities?.[0]?.id ||
                              item.owner_id,
                          }}
                          search={{ tab: "items", q: item.title }}
                          onClick={(e) => e.stopPropagation()}
                          style={{ textDecoration: "none" }}
                        >
                          <Text
                            fontSize="xs"
                            color="purple.500"
                            fontWeight="bold"
                            _hover={{ textDecoration: "underline" }}
                          >
                            {item.community_owner?.name ||
                              (item as any).owner_name ||
                              item.communities?.[0]?.name ||
                              "Community"}
                          </Text>
                        </Link>
                      ) : (
                        <Link
                          to={isOwner ? "/items" : "/users/$userId"}
                          params={isOwner ? {} : { userId: item.owner_id }}
                          search={{ q: item.title }}
                          onClick={(e) => e.stopPropagation()}
                          style={{ textDecoration: "none" }}
                        >
                          <Text
                            fontSize="xs"
                            color="main.500"
                            _hover={{ textDecoration: "underline" }}
                          >
                            {isOwner
                              ? "You"
                              : (item as any).owner_name ||
                                String(
                                  item.owner?.full_name ||
                                    item.owner?.email ||
                                    "Owner",
                                )}
                          </Text>
                        </Link>
                      )}
                    </>
                  )}
                </HStack>
              </Box>
            </Card.Body>
          </Card.Root>
        </Box>
      </Box>

      <ConfirmationModal
        isOpen={isReadingLogConfirmOpen}
        onClose={() => setIsReadingLogConfirmOpen(false)}
        onConfirm={() => readingLogMutation.mutate()}
        title={readingLogEntry ? "Mark as Completed" : "Add to Reading List"}
        message={
          readingLogEntry
            ? `Have you finished reading '${item.title}'?`
            : `Do you want to add '${item.title}' to your reading log?`
        }
        isLoading={readingLogMutation.isPending}
      />
    </>
  )
}

export default ItemCard
