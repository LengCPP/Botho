import { Badge, Box, Button, Container, Flex, GridItem, HStack, Heading, Input, Separator, SimpleGrid, Tabs, Text, Textarea, VStack, useBreakpointValue } from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import { FaChevronLeft, FaFileImport } from "react-icons/fa"
import { FiBell, FiBellOff, FiBox, FiCheck, FiClock, FiEdit2, FiLogOut, FiMessageSquare, FiPlus, FiSend, FiSettings, FiShield, FiTrash2, FiUserCheck, FiUserMinus, FiUserPlus, FiUsers, FiX } from "react-icons/fi"
import { z } from "zod"
import { CommunitiesService, FriendsService, LoansService } from "@/client"
import ConfirmationModal from "@/components/Common/ConfirmationModal"
import { ImportItems } from "@/components/Common/ImportItems"
import ReviewModal from "@/components/Common/ReviewModal"
import AddItem from "@/components/Items/AddItem"
import { CollectionGrid } from "@/components/Items/CollectionGrid"
import { CompactItemCard } from "@/components/Items/CompactItemCard"
import ItemCard from "@/components/Items/ItemCard"
import { ItemDetailModal } from "@/components/Items/ItemDetailModal"
import { ItemsViewOptions } from "@/components/Items/ItemsViewOptions"
import { LoanCard } from "@/components/Items/LoanCard"
import PendingItems from "@/components/Pending/PendingItems"
import { DialogBody, DialogCloseTrigger, DialogContent, DialogFooter, DialogHeader, DialogRoot, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from "@/components/ui/menu"
import { PaginationItems, PaginationNextTrigger, PaginationPrevTrigger, PaginationRoot } from "@/components/ui/pagination"
import useAuth from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import { groupItems } from "@/utils"

const COLLECTIONS_LIMIT = 12
const sS = z.object({ tab: z.enum(["board", "items", "members", "loans", "manage", "import"]).catch("board"), q: z.string().optional(), page: z.number().catch(1), limit: z.number().catch(() => Number(localStorage.getItem("limit")) || 8), sort_by: z.string().catch(() => localStorage.getItem("sort_by") || "created_at"), sort_order: z.string().catch(() => localStorage.getItem("sort_order") || "desc"), category: z.string().optional(), genre: z.string().optional(), view_mode: z.enum(["card", "list"]).catch(() => (localStorage.getItem("view_mode") as any) || "card"), display_type: z.enum(["items", "collections"]).catch(() => (localStorage.getItem("display_type") as any) || "collections"), subject: z.string().optional(), author: z.string().optional(), organize_by: z.enum(["subject", "genre", "category", "author", "ownership"]).catch(() => (localStorage.getItem("organize_by") as any) || "subject") })
const gQO = (p: any) => ({ queryFn: () => CommunitiesService.readCommunityItems({ id: p.communityId, skip: (p.page - 1) * p.limit, limit: p.limit, sortBy: p.sort_by, sortOrder: p.sort_order, category: p.category, genre: p.genre, author: p.author, q: p.q }), queryKey: ["communityItems", p.communityId, p] })
export const Route = createFileRoute("/_layout/communities/$communityId")({ component: CommunityBoard, validateSearch: s => sS.parse(s) })

function CommunityBoard() {
  const { communityId: cId } = Route.useParams(), { tab, q: qP, page, limit, sort_by, sort_order, category, genre, view_mode, display_type, subject, author, organize_by } = Route.useSearch()
  const { user: currU } = useAuth(), { showSuccessToast, showErrorToast } = useCustomToast(), queryClient = useQueryClient(), navigate = useNavigate({ from: Route.fullPath })
  const [msg, setMsg] = useState(""), [isLOpen, setIsLOpen] = useState(false), [isROpen, setIsROpen] = useState(false), [remM, setRemM] = useState<any>(null), [selI, setSelI] = useState<any>(null), [selL, setSelL] = useState<any>(null)
  const isD = !!subject || !!author || !!category || !!genre, curF = subject || author || genre || category || "Unknown"

  useEffect(() => Object.entries({ view_mode, display_type, organize_by, sort_by, sort_order, limit }).forEach(([k, v]) => localStorage.setItem(k, String(v))), [view_mode, display_type, organize_by, sort_by, sort_order, limit])
  const upS = (p: any) => navigate({ search: (prev: any) => ({ ...prev, ...p, page: 1 }) }), setP = (p: number) => navigate({ search: (prev: any) => ({ ...prev, page: p }) })
  const hOC = (n: string) => upS(organize_by === "author" ? { author: n } : organize_by === "genre" ? { genre: n } : organize_by === "category" ? { category: n } : { subject: n })

  const { data: comm, isLoading: isLC } = useQuery({ queryKey: ["community", cId], queryFn: () => CommunitiesService.readCommunity({ id: cId }) as Promise<any>, initialData: () => (queryClient.getQueryData<any>(["communities"])?.data || []).find((c: any) => c.id === cId) })
  const isM = comm?.current_user_status === "ACCEPTED", isA = comm?.created_by === currU?.id || currU?.is_superuser || comm?.current_user_role === "ADMIN", isStaff = isA || comm?.current_user_role === "MODERATOR"
  const { data: members, isLoading: isLM } = useQuery({ queryKey: ["communityMembers", cId], queryFn: () => CommunitiesService.readCommunityMembers({ id: cId, status: "ACCEPTED" as any }), enabled: !!isM })
  const otherA = useMemo(() => members?.data?.some((m: any) => m.community_role === "ADMIN" && m.id !== currU?.id) || false, [members, currU])
  const { data: apps, isLoading: isLA } = useQuery({ queryKey: ["communityApplicants", cId], queryFn: () => CommunitiesService.readCommunityMembers({ id: cId, status: "PENDING" as any }), enabled: !!isStaff })
  const { data: commI, isLoading: isLI, isPlaceholderData: isP } = useQuery({ ...gQO({ communityId: cId, page, sort_by, sort_order, limit, category, genre, author, q: qP }), placeholderData: (p) => p, enabled: !!isM && tab === "items" && (isD || display_type === "items") })
  const { data: facets, isLoading: isLF } = useQuery({ queryKey: ["communityFacets", cId, organize_by, qP], queryFn: () => (CommunitiesService as any).readCommunityItemFacets({ id: cId, groupBy: organize_by, q: qP }), enabled: !!isM && tab === "items" && display_type === "collections" && !isD })

  useEffect(() => { if (tab === "items" && display_type === "items" && commI?.data.length === limit) queryClient.prefetchQuery(gQO({ communityId: cId, page: page + 1, sort_by, sort_order, limit, category, genre, author, q: qP })) }, [commI, page, limit, queryClient, cId, sort_by, sort_order, category, genre, author, qP, tab, display_type])
  useQuery({ queryKey: ["loans", "outgoing"], queryFn: () => LoansService.readOutgoingLoanRequests({}), enabled: !!currU && isM && tab === "items" })
  const { data: commL, isLoading: isLL } = useQuery({ queryKey: ["communityLoans", cId], queryFn: () => CommunitiesService.readCommunityLoans({ id: cId }), enabled: !!isM })
  const { data: ann, isLoading: isLAn } = useQuery({ queryKey: ["communityAnnouncements", cId], queryFn: () => CommunitiesService.readCommunityAnnouncements({ id: cId }), enabled: !!isM })
  const { data: msgs, isLoading: isLMs } = useQuery({ queryKey: ["communityMessages", cId], queryFn: () => CommunitiesService.readCommunityMessages({ id: cId }), enabled: !!isM })

  const actL = useMemo(() => commL?.data.filter((l: any) => ["ACCEPTED", "ACTIVE", "RETURN_PENDING", "EXTENSION_PENDING"].includes(l.status)) || [], [commL])
  const penR = useMemo(() => commL?.data.filter((l: any) => ["PENDING", "EXTENSION_PENDING"].includes(l.status)) || [], [commL])
  const audT = useMemo(() => commL?.data.filter((l: any) => ["REJECTED", "CANCELLED", "RETURNED", "DEFAULTED"].includes(l.status)) || [], [commL])

  const postMsgM = useMutation({ mutationFn: (c: string) => CommunitiesService.createCommunityMessage({ id: cId, requestBody: { content: c } }), onSuccess: () => { setMsg(""); queryClient.invalidateQueries({ queryKey: ["communityMessages", cId] }) }, onError: () => showErrorToast("Failed") })
  const toggleNotifM = useMutation({ mutationFn: (e: boolean) => CommunitiesService.updateCommunityNotifications({ id: cId, enabled: e }), onSuccess: (d) => { showSuccessToast(d.message); queryClient.invalidateQueries({ queryKey: ["community", cId] }) }, onError: () => showErrorToast("Failed") })
  const upMemM = useMutation({ mutationFn: (d: any) => CommunitiesService.updateCommunityMemberRole({ id: cId, userId: d.userId, requestBody: { role: d.role, status: d.status } }), onSuccess: () => { showSuccessToast("Updated"); ["communityMembers", "communityApplicants"].forEach(k => queryClient.invalidateQueries({ queryKey: [k, cId] })) }, onError: () => showErrorToast("Failed") })
  const remMemM = useMutation({ mutationFn: (u: string) => CommunitiesService.leaveCommunity({ id: cId, userId: u }), onSuccess: () => { showSuccessToast("Removed"); setIsROpen(false); setRemM(null); ["communityMembers", "communityApplicants"].forEach(k => queryClient.invalidateQueries({ queryKey: [k, cId] })) }, onError: () => showErrorToast("Failed") })
  const leaveM = useMutation({ mutationFn: () => CommunitiesService.leaveCommunity({ id: cId }), onSuccess: () => { showSuccessToast("Left"); queryClient.invalidateQueries({ queryKey: ["communities"] }); navigate({ to: "/communities" }) }, onError: () => showErrorToast("Failed") })
  const friendM = useMutation({ mutationFn: (u: string) => FriendsService.createFriendRequest({ friendId: u }), onSuccess: () => { showSuccessToast("Sent!"); queryClient.invalidateQueries({ queryKey: ["communityMembers", cId] }) }, onError: () => showErrorToast("Failed") })

  const items = commI?.data || [], colls = useMemo(() => {
    if (comm?.collection_index?.[organize_by]) return Object.entries(comm.collection_index[organize_by]).map(([n, d]: any) => ({ name: n, count: d.count, sample_images: d.sample_images })).sort((a, b) => a.name.localeCompare(b.name))
    return (facets || []).map((f: any) => ({ name: f.name, count: f.count, sample_images: f.sample_images }))
  }, [comm, organize_by, facets])
  const pagC = useMemo(() => colls.slice((page - 1) * COLLECTIONS_LIMIT, page * COLLECTIONS_LIMIT), [colls, page])

  if (isLC) return <Container maxW="full" pt={12}><Text>Loading...</Text></Container>
  if (!comm) return <Container maxW="full" pt={12}><Text>Not found</Text></Container>

  const rG = (g: any) => <SimpleGrid columns={view_mode === "list" ? 1 : { base: 2, sm: 3, md: 4 }} gap={view_mode === "list" ? 2 : { base: 2, md: 6 }} opacity={isP ? 0.5 : 1}>{g.map((x: any) => view_mode === "list" ? <CompactItemCard key={x[0].id} item={x} communityId={cId} isAdmin={isA} onShowDetails={() => setSelI(x[0])} onReview={setSelL} /> : <ItemCard key={x[0].id} item={x} communityId={cId} isAdmin={isA} onShowDetails={() => setSelI(x[0])} onReview={setSelL} />)}</SimpleGrid>

  return (
    <Container maxW="full"><VStack align="stretch" gap={6} pt={8}>
      <Flex align="center" gap={4} wrap="wrap" justify="space-between"><VStack align="start" gap={1}><Heading size="xl">{comm.name}</Heading><HStack><Badge colorPalette={comm.is_private ? "gray" : "main"}>{comm.is_private ? "Private" : "Global"}</Badge><Badge colorPalette={comm.requires_approval ? "red" : "green"}>{comm.requires_approval ? "Closed" : "Open"}</Badge></HStack></VStack>
        {isM && <HStack gap={2}><Button size="xs" variant="ghost" onClick={() => toggleNotifM.mutate(!comm.notifications_enabled)} loading={toggleNotifM.isPending}>{comm.notifications_enabled ? <FiBell /> : <FiBellOff color="gray" />}</Button>{!isA && <Button size="xs" variant="outline" colorPalette="red" onClick={() => setIsLOpen(true)} loading={leaveM.isPending}><FiLogOut /> Leave</Button>}</HStack>}
      </Flex><Text color="fg.muted" fontSize="lg">{comm.description || "No description."}</Text><Separator />
      <Tabs.Root value={tab} onValueChange={e => navigate({ search: (p: any) => ({ ...p, tab: e.value as any }) })} variant="enclosed">
        <Tabs.List display={{ base: "grid", md: "flex" }} gridTemplateColumns={{ base: "repeat(3, 1fr)", md: "none" }} gap={{ base: 1, md: 0 }}>
          <Tabs.Trigger value="board" justifyContent="center"><FiMessageSquare /> Board</Tabs.Trigger><Tabs.Trigger value="items" justifyContent="center"><FiBox /> Items ({comm?.collection_index?.total ?? 0})</Tabs.Trigger><Tabs.Trigger value="members" justifyContent="center"><FiUsers /> Members ({members?.count || 0})</Tabs.Trigger>
          {isA && <Tabs.Trigger value="loans" justifyContent="center"><FiClock /> Loans</Tabs.Trigger>}{isStaff && <Tabs.Trigger value="manage" justifyContent="center"><FiShield /> Manage</Tabs.Trigger>}{isA && <Tabs.Trigger value="import" justifyContent="center"><FaFileImport /> Import</Tabs.Trigger>}
        </Tabs.List>
        <Tabs.Content value="board" pt={6}>{!isM ? <Box p={8} textAlign="center" borderWidth="1px" rounded="md" bg="bg.muted"><Text>You must be a member.</Text></Box> :
          <SimpleGrid columns={{ base: 1, md: 3 }} gap={8}><Box><VStack align="stretch" gap={4}><Flex justify="space-between" align="center"><Heading size="md">Announcements</Heading>{isA && <AddAnnouncementModal communityId={cId} />}</Flex>
            <Box maxH="400px" overflowY="auto" css={{ "&::-webkit-scrollbar": { display: "none" }, scrollbarWidth: "none" }}><VStack align="stretch" gap={3}>{isLAn ? <Text>...</Text> : !ann?.data.length ? <Text fontStyle="italic">No announcements.</Text> : ann.data.map((a: any) => <AnnouncementItem key={a.id} ann={a} />)}</VStack></Box>
          </VStack></Box><GridItem colSpan={{ base: 1, md: 2 }}><VStack align="stretch" gap={4}><Heading size="md">Messages</Heading><Box h="400px" borderWidth="1px" rounded="md" p={4} bg="bg.panel" overflowY="auto" display="flex" flexDirection="column-reverse"><VStack align="stretch" gap={3}>{isLMs ? <Text>...</Text> : !msgs?.data.length ? <Text fontStyle="italic">No messages.</Text> : msgs.data.map((m: any) => <MessageItem key={m.id} msg={m} communityId={cId} isStaff={isStaff} currentUser={currU} queryClient={queryClient} />)}</VStack></Box>
            <form onSubmit={e => { e.preventDefault(); msg.trim() && postMsgM.mutate(msg) }}><Flex gap={2}><Input placeholder="Type a message..." value={msg} onChange={e => setMsg(e.target.value)} /><Button type="submit" colorPalette="accent" loading={postMsgM.isPending}><FiSend /></Button></Flex></form>
          </VStack></GridItem></SimpleGrid>}</Tabs.Content>
        <Tabs.Content value="items" pt={6}><VStack align="stretch" gap={8}>{isA && <DonationManagement items={items} communityId={cId} otherAdminsExist={otherA} currentUserId={currU?.id} />}
          <Flex justify="space-between" align="center" wrap="wrap" gap={4}><HStack gap={4} align="baseline"><VStack align="start" gap={0}><Heading size="md">Items</Heading><Text fontSize="sm" color="gray.500">Total: {comm?.collection_index?.total ?? commI?.count ?? 0}</Text></VStack><AddItem communityId={cId} isAdmin={isA} /></HStack>
            <ItemsViewOptions q={qP} onChangeQ={v => upS({ q: v })} viewMode={view_mode} onChangeViewMode={m => upS({ view_mode: m })} displayType={display_type} onChangeDisplayType={t => upS({ display_type: t, subject: undefined })} sortBy={sort_by} onChangeSortBy={v => upS({ sort_by: v })} sortOrder={sort_order} onChangeSortOrder={v => upS({ sort_order: v })} limit={limit} onChangeLimit={v => upS({ limit: v })} category={category} onChangeCategory={v => upS({ category: v, genre: undefined })} genre={genre} onChangeGenre={v => upS({ genre: v })} organizeBy={organize_by} onChangeOrganizeBy={v => upS({ organize_by: v, subject: undefined })} showDisplayToggle showViewToggle showFilter showSort showLimit organizeOptions={["subject", "genre", "category", "author", ...(isA ? ["ownership"] : [])]} />
          </Flex>{isLI || isLF ? <PendingItems /> : !items.length && page === 1 && !facets?.length ? <Box p={10} textAlign="center" borderWidth="1px" borderStyle="dashed" rounded="md"><Text color="fg.muted">{qP ? "No matches." : "Empty pool."}</Text></Box> :
            <Box mt={8}>{display_type === "collections" && !isD ? <Box><CollectionGrid items={pagC} type={organize_by} onOpen={hOC} /><Flex justify="center" mt={8}><PaginationRoot count={colls.length} pageSize={COLLECTIONS_LIMIT} onPageChange={e => setP(e.page)}><Flex><PaginationPrevTrigger /><PaginationItems /><PaginationNextTrigger /></Flex></PaginationRoot></Flex></Box> :
              <Box>{display_type === "collections" && isD && <VStack align="start" mb={6} gap={2}><Button variant="ghost" size="sm" onClick={() => upS({ subject: undefined, author: undefined, genre: undefined, category: undefined })}><FaChevronLeft /> Collections</Button><Heading size="lg" color="ui.hover" textTransform="uppercase">{items[0]?.item_type === "book" ? "Books" : "Items"} {curF.toLowerCase() === "others" ? `with unspecified ${organize_by}` : `${organize_by === "author" ? "by" : organize_by === "genre" ? "in" : organize_by === "category" ? "in category" : "on"} ${curF}`} ({items.length})</Heading></VStack>}
                <VStack align="stretch" gap={8}>{rG(groupItems(items))}<Flex justify="center"><PaginationRoot count={commI?.count || 0} pageSize={limit} onPageChange={e => setP(e.page)}><Flex><PaginationPrevTrigger /><PaginationItems /><PaginationNextTrigger /></Flex></PaginationRoot></Flex></VStack>
              </Box>}</Box>}</VStack><ItemDetailModal item={selI} isOpen={!!selI} onClose={() => setSelI(null)} /></Tabs.Content>
        <Tabs.Content value="members" pt={6}><SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={4}>{isLM ? <Text>...</Text> : members?.data.filter((m: any) => m.community_status === "ACCEPTED").map((m: any) => (
          <Box key={m.id} p={4} borderWidth="1px" rounded="md" bg="bg.panel" _hover={{ borderColor: "ui.hover" }}><Flex justify="space-between" align="center"><VStack align="start" gap={0}><Text fontWeight="bold">{m.full_name || m.email}</Text><Badge size="xs" colorPalette={m.community_role === "ADMIN" ? "purple" : m.community_role === "MODERATOR" ? "main" : "gray"}>{m.community_role || "MEMBER"}</Badge></VStack>
            <Flex gap={2}>{m.id !== currU?.id && <Button size="xs" variant="ghost" onClick={() => !m.friendship_status && friendM.mutate(m.id)} colorPalette={m.friendship_status === "PENDING" ? "accent" : m.friendship_status === "ACCEPTED" ? "green" : "gray"} disabled={!!m.friendship_status}>{m.friendship_status === "ACCEPTED" ? <FiUserCheck /> : <FiUserPlus />}</Button>}<Link to={`/users/${m.id}`}><Button size="xs" variant="outline">Profile</Button></Link></Flex>
          </Flex></Box>))}</SimpleGrid></Tabs.Content>
        {isStaff && <>{isA && <Tabs.Content value="loans" pt={6}><VStack align="stretch" gap={4}><Tabs.Root defaultValue="requests" variant="plain"><Tabs.List gap={8} mb={6} borderBottomWidth="1px" pb={2}>
          {[{ v: "requests", l: "Requests", c: penR.length }, { v: "active", l: "Active", c: actL.length }, { v: "audit", l: "Audit", c: audT.length }].map(t => <Tabs.Trigger key={t.v} value={t.v} _selected={{ color: "ui.hover", borderBottom: "2px solid", borderColor: "ui.hover" }}><Heading size="md">{t.l} ({t.c})</Heading></Tabs.Trigger>)}
        </Tabs.List>
          {[{ v: "requests", d: penR }, { v: "active", d: actL }, { v: "audit", d: audT }].map(t => <Tabs.Content key={t.v} value={t.v}>{isLL ? <Text>...</Text> : !t.d.length ? <Box p={8} textAlign="center" borderWidth="1px" borderRadius="lg" borderStyle="dashed"><Text fontStyle="italic">Empty.</Text></Box> : <VStack align="stretch" gap={4}>{t.d.map((l: any) => <LoanCard key={l.id} loan={l} type="incoming" otherAdminsExist={otherA} onReview={setSelL} />)}</VStack>}</Tabs.Content>)}
        </Tabs.Root></VStack></Tabs.Content>}
          <Tabs.Content value="manage" pt={6}><VStack align="stretch" gap={8}>
            {isLA ? <Text>...</Text> : (apps?.data?.length ?? 0) > 0 && <Box><Heading size="md" mb={4} color="ui.hover">Pending ({apps?.count})</Heading><VStack align="stretch" gap={3}>{apps?.data?.map((m: any) => (
              <Flex key={m.id} justify="space-between" align="center" p={4} borderWidth="1px" rounded="md" bg="bg.panel" borderColor="ui.hover"><VStack align="start" gap={0}><Text fontWeight="bold">{m.full_name || m.email}</Text><Badge size="xs" colorPalette="yellow">APPLICANT</Badge></VStack><HStack gap={2}><Button size="xs" colorPalette="green" onClick={() => upMemM.mutate({ userId: m.id, status: "ACCEPTED" })}>Approve</Button><Button size="xs" colorPalette="red" variant="outline" onClick={() => upMemM.mutate({ userId: m.id, status: "REJECTED" })}>Reject</Button></HStack></Flex>))}</VStack></Box>}
            <Box><Heading size="md" mb={4}>Members</Heading>{isLM ? <Text>...</Text> : <VStack align="stretch" gap={3}>{members?.data.filter((m: any) => m.community_status === "ACCEPTED").map((m: any) => {
              const isC = m.id === comm.created_by, r = m.community_role || (isC ? "ADMIN" : "MEMBER"), isS = r === "ADMIN" || r === "MODERATOR"
              return (<Flex key={m.id} justify="space-between" align="center" p={4} borderWidth="1px" rounded="md" bg="bg.panel"><VStack align="start" gap={0}><Text fontWeight="bold">{m.full_name || m.email}</Text><Badge size="xs" colorPalette={r === "ADMIN" ? "purple" : r === "MODERATOR" ? "main" : "gray"}>{r}</Badge></VStack>
                <HStack gap={2}>{!isC && m.id !== currU?.id && <>{isA && <MenuRoot><MenuTrigger asChild><Button size="xs" variant="outline"><FiSettings /> Role</Button></MenuTrigger><MenuContent>{["ADMIN", "MODERATOR", "MEMBER"].map(rv => <MenuItem key={rv} value={rv} onClick={() => upMemM.mutate({ userId: m.id, role: rv })} disabled={r === rv}>{rv}</MenuItem>)}</MenuContent></MenuRoot>}
                  {(isA || (isStaff && !isS)) && <Button size="xs" colorPalette="red" variant="outline" onClick={() => { setRemM({ id: m.id, name: m.full_name || m.email }); setIsROpen(true) }}><FiUserMinus /> Remove</Button>}</>}</HStack></Flex>)
            })}</VStack>}</Box></VStack></Tabs.Content>
          {isA && <Tabs.Content value="import" pt={6}><ImportItems communityId={cId} /></Tabs.Content>}</>}
      </Tabs.Root>
    </VStack>
      <ConfirmationModal isOpen={isLOpen} onClose={() => setIsLOpen(false)} onConfirm={() => leaveM.mutate()} title="Leave" message="Leave community?" isLoading={leaveM.isPending} />
      <ConfirmationModal isOpen={isROpen} onClose={() => { setIsROpen(false); setRemM(null) }} onConfirm={() => remMemM.mutate(remM!.id)} title="Remove" message={`Remove ${remM?.name}?`} isLoading={remMemM.isPending} />
      {selL && <ReviewModal loan={selL} isOpen={!!selL} onClose={() => setSelL(null)} />}</Container>
  )
}

function AddAnnouncementModal({ communityId }: { communityId: string }) {
  const [t, setT] = useState(""), [c, setC] = useState(""), [o, setO] = useState(false), queryClient = useQueryClient(), { showSuccessToast, showErrorToast } = useCustomToast(), isMob = useBreakpointValue({ base: true, md: false })
  const mut = useMutation({ mutationFn: () => CommunitiesService.createCommunityAnnouncement({ id: communityId, requestBody: { title: t, content: c } }), onSuccess: () => { showSuccessToast("Posted!"); setT(""); setC(""); setO(false); queryClient.invalidateQueries({ queryKey: ["communityAnnouncements", communityId] }) }, onError: () => showErrorToast("Failed") })
  return (
    <DialogRoot open={o} onOpenChange={e => setO(e.open)}><DialogTrigger asChild><Button size="sm" colorPalette="accent" variant="outline"><FiPlus /> {isMob ? "Announce" : "Add Announcement"}</Button></DialogTrigger>
      <DialogContent><DialogHeader><DialogTitle>New Announcement</DialogTitle></DialogHeader><DialogBody><VStack gap={4}><Field label="Title" required><Input value={t} onChange={e => setT(e.target.value)} /></Field><Field label="Content" required><Textarea value={c} onChange={e => setC(e.target.value)} rows={5} /></Field></VStack></DialogBody>
        <DialogFooter><Button variant="ghost" onClick={() => setO(false)}>Cancel</Button><Button colorPalette="accent" loading={mut.isPending} onClick={() => mut.mutate()} disabled={!t.trim() || !c.trim()}>Post</Button></DialogFooter><DialogCloseTrigger /></DialogContent></DialogRoot>
  )
}

function AnnouncementItem({ ann }: { ann: any }) {
  const [exp, setExp] = useState(false)
  return (
    <Box p={4} borderWidth="1px" rounded="md" bg="bg.panel" borderColor={exp ? "ui.hover" : "border.subtle"} cursor="pointer" onClick={() => setExp(!exp)} transition="all 0.2s">
      <Flex justify="space-between" align="center" gap={4}><Heading size="sm" lineClamp={exp ? undefined : 1} flex={1}>{ann.title}</Heading><Text fontSize="2xs" color="fg.subtle" whiteSpace="nowrap">{new Date(ann.created_at).toLocaleDateString()}</Text></Flex>
      {exp && <VStack align="start" mt={4} gap={3}><Separator /><Text fontSize="sm" whiteSpace="pre-wrap" color="fg.muted">{ann.content}</Text><Text fontSize="2xs" color="fg.subtle" fontWeight="bold">Posted by {ann.author.full_name || ann.author.email}</Text></VStack>}
    </Box>
  )
}

function MessageItem({ msg, communityId, isStaff, currentUser, queryClient }: any) {
  const [isEd, setIsEd] = useState(false), [isD, setIsD] = useState(false), [ed, setEd] = useState(msg.content), { showErrorToast } = useCustomToast(), isAut = msg.author_id === currentUser?.id
  const dM = useMutation({ mutationFn: () => CommunitiesService.deleteCommunityMessage({ id: communityId, messageId: msg.id }), onSuccess: () => { setIsD(false); queryClient.invalidateQueries({ queryKey: ["communityMessages", communityId] }) }, onError: () => showErrorToast("Failed") })
  const uM = useMutation({ mutationFn: (c: string) => CommunitiesService.updateCommunityMessage({ id: communityId, messageId: msg.id, requestBody: { content: c } }), onSuccess: () => { setIsEd(false); queryClient.invalidateQueries({ queryKey: ["communityMessages", communityId] }) }, onError: () => showErrorToast("Failed") })
  return (
    <Box p={3} bg="bg.muted" rounded="lg">
      <Flex justify="space-between" align="baseline" mb={1}><HStack gap={2}><Text fontWeight="bold" fontSize="xs" color="ui.hover">{msg.author.full_name || msg.author.email}</Text>{(isAut || isStaff) && !isEd && <HStack gap={1}>{isAut && <Button size="2xs" variant="ghost" onClick={() => setIsEd(true)}><FiEdit2 size="10px" /></Button>}<Button size="2xs" variant="ghost" colorPalette="red" onClick={() => setIsD(true)} loading={dM.isPending}><FiTrash2 size="10px" /></Button></HStack>}</HStack><Text fontSize="2xs" color="fg.subtle">{new Date(msg.created_at).toLocaleString()}</Text></Flex>
      {isEd ? <VStack align="stretch" mt={2} gap={2}><Textarea size="sm" value={ed} onChange={e => setEd(e.target.value)} rows={2} /><HStack justify="flex-end" gap={2}><Button size="xs" variant="ghost" onClick={() => setIsEd(false)}><FiX /></Button><Button size="xs" colorPalette="accent" onClick={() => ed.trim() && uM.mutate(ed)} loading={uM.isPending}><FiCheck /></Button></HStack></VStack> : <Text fontSize="sm">{msg.content}</Text>}
      <ConfirmationModal isOpen={isD} onClose={() => setIsD(false)} onConfirm={() => dM.mutate()} title="Delete" message="Delete message?" isLoading={dM.isPending} />
    </Box>
  )
}

function DonationManagement({ items, communityId, otherAdminsExist, currentUserId }: any) {
  const queryClient = useQueryClient(), { showSuccessToast, showErrorToast } = useCustomToast(), pending = items.filter((i: any) => i.is_donation_pending)
  const rM = useMutation({ mutationFn: (itemId: string) => CommunitiesService.ratifyDonation({ id: communityId, itemId }), onSuccess: () => { showSuccessToast("Accepted!"); queryClient.invalidateQueries({ queryKey: ["communityItems", communityId] }); queryClient.invalidateQueries({ queryKey: ["items"] }) }, onError: () => showErrorToast("Failed") })
  if (!pending.length) return null
  return (
    <Box mb={8} p={4} borderWidth="1px" rounded="lg" bg="bg.panel" borderColor="orange.500"><Heading size="md" mb={4} color="orange.500">Donations</Heading><VStack align="stretch" gap={3}>{pending.map((i: any) => { const isO = i.added_by_id === currentUserId, can = !isO || otherAdminsExist; return (<Flex key={i.id} justify="space-between" align="center" p={3} bg="bg.muted" rounded="md" opacity={can ? 1 : 0.6}><VStack align="start" gap={0}><Text fontWeight="bold">{i.title} {isO && "(Yours)"}</Text><Text fontSize="xs" color="fg.muted">{isO ? (otherAdminsExist ? "Wait for other admin" : "Verified") : "Member donation"}</Text></VStack><Button size="sm" colorPalette="green" onClick={() => rM.mutate(i.id)} disabled={!can} loading={rM.isPending && rM.variables === i.id}>Accept</Button></Flex>) })}</VStack></Box>
  )
}

export default CommunityBoard
