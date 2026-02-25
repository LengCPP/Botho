import {
  Accordion,
  Badge,
  Box,
  HStack,
  Icon,
  IconButton,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useState } from "react"
import {
  FiBell,
  FiBookOpen,
  FiGlobe,
  FiHeart,
  FiHelpCircle,
  FiHome,
  FiList,
  FiPackage,
  FiSettings,
  FiUserPlus,
} from "react-icons/fi"

import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

const sections = [
  {
    icon: FiHome,
    title: "Dashboard & Search",
    badge: "Start here",
    content: [
      {
        heading: "Global Quick Search",
        text: "The search bar at the top of your dashboard searches across the entire app simultaneously — Items, Users, and Communities. As you type, a dropdown shows matches. Click any result to go directly there.",
      },
      {
        heading: "Find in Catalogue",
        text: "The search field inside Items pages or Community boards filters only the items you're currently viewing. It works on Titles, Authors, and metadata. It's context-aware: in Collections view it filters collection names, not individual items.",
      },
      {
        heading: "Activity Feed",
        text: "Your dashboard shows recent activity from your communities and friends — new items, loan updates, and announcements.",
      },
    ],
  },
  {
    icon: FiPackage,
    title: "My Items",
    content: [
      {
        heading: "Adding an Item",
        text: "Click 'Add Item' and choose a type from the dropdown. Books use the integrated search to auto-fill metadata (title, author, cover) from Google Books. All other types show only the fields that apply to that type — no irrelevant fields cluttering the form.",
      },
      {
        heading: "Item Types",
        text: "Books and General items are built in. For everything else — tools, board games, clothing, equipment — you can create a custom type. Select '+ Create new type…' in the Add Item dropdown, give it a name, pick which fields apply (brand, weight, dimensions, platform, age group, etc.), and choose the primary label field. Once created, any member of the platform can use that type.",
      },
      {
        heading: "Type Tabs",
        text: "If you have items of more than one type, tabs appear at the top of your Items page — one tab per type. Clicking a tab filters the view to that type only. The Collections view (subject/genre groupings) is only available under the Books tab, since that grouping is specific to books.",
      },
      {
        heading: "Bulk Import",
        text: "Upload an Excel (.xlsx) or CSV file to import many items at once. You'll map your file's columns to fields like Title, Author, and ISBN. A staging screen lets you review and correct items before finalising. Descriptions and covers are fetched in the background automatically.",
      },
      {
        heading: "Manage Items Dashboard",
        text: "Switch to Manage mode for batch actions. Select multiple items, then Delete, Mark as Lost/Found, Make Private/Public, or Sync metadata from the Botho Archive. Use the Catalogue / Lost / Private tabs to view different item states.",
      },
      {
        heading: "Faceted Filtering",
        text: "Use the filter panel to narrow items by Category, Genre, Subject, or Author. Facets update automatically as you apply filters.",
      },
      {
        heading: "Collections View",
        text: "Available for books only. Switch to Collections view to see your books grouped by Subject, Genre, or Author. Click a collection to drill into those books.",
      },
    ],
  },
  {
    icon: FiGlobe,
    title: "Communities",
    content: [
      {
        heading: "Joining a Community",
        text: "Go to Communities and search for a group. Click Join. If the community requires approval, your request is sent to the admins and you'll be notified when accepted.",
      },
      {
        heading: "Creating a Community",
        text: "Click 'Create Community'. Set a name, description, and choose Public (anyone can find it) or Private (invite only). You can also require admin approval before new members can join.",
      },
      {
        heading: "Community Board",
        text: "Inside a community you'll see the shared item board. Browse items contributed by all members, request loans, or contribute your own items.",
      },
      {
        heading: "Bucket Collections",
        text: "Bucket collections are shared community-owned collections. Any member can add items to them. Orphaned entries are cleaned up automatically.",
      },
      {
        heading: "Admin Controls",
        text: "As a community admin you can manage members, post announcements, pin rules, and moderate shared items.",
      },
    ],
  },
  {
    icon: FiUserPlus,
    title: "Friends",
    content: [
      {
        heading: "Adding Friends",
        text: "Go to Friends and search by name or Public ID. Send a friend request — the other person will be notified and can accept or decline.",
      },
      {
        heading: "Viewing Friend Profiles",
        text: "Once connected, click a friend's name or avatar to see their public items, communities, and reading log (depending on their privacy settings).",
      },
      {
        heading: "Privacy Controls",
        text: "In Settings you can control who sees your items: Friends only, Community members, or Public. You can also hide your contact details and full name.",
      },
    ],
  },
  {
    icon: FiBookOpen,
    title: "Loans & Borrowing",
    content: [
      {
        heading: "Requesting a Loan",
        text: "Find an item in a community board and click 'Request Loan'. Pick your desired start and end dates. The owner will be notified.",
      },
      {
        heading: "Approving / Rejecting",
        text: "As an owner, open your Loans page to see pending requests. Accept to approve or Reject to decline. The requester is notified either way.",
      },
      {
        heading: "Ratification",
        text: "After the owner approves, the borrower must 'Ratify' the loan to confirm they have physically received the item. This activates the loan.",
      },
      {
        heading: "Returning an Item",
        text: "When done, the borrower signals a return. The owner then confirms receipt to close the loan and mark the item as available again.",
      },
      {
        heading: "Cancellations",
        text: "Either party can cancel a loan before it has been ratified. After ratification, use the dispute flow if there's an issue.",
      },
    ],
  },
  {
    icon: FiList,
    title: "Reading Log",
    content: [
      {
        heading: "Tracking Progress",
        text: "Open a book and click 'Add to Reading Log' (or go to the Reading Log page). Set its status to Reading, Completed, or Dropped.",
      },
      {
        heading: "Reviews & Ratings",
        text: "Rate a book 1–5 stars and leave a written review. Your ratings are visible to friends and community members to help them discover good reads.",
      },
      {
        heading: "Filtering the Log",
        text: "On the Reading Log page, filter by status (Reading / Completed / Dropped) or search by title to find specific entries.",
      },
    ],
  },
  {
    icon: FiBell,
    title: "Notifications",
    content: [
      {
        heading: "In-App Notifications",
        text: "The bell icon in the top-right shows your notifications. You'll be alerted for loan requests, approvals, returns, friend requests, and community activity.",
      },
      {
        heading: "Push Notifications",
        text: "Enable browser push notifications (your browser will ask for permission) to get alerts even when the app isn't open.",
      },
    ],
  },
  {
    icon: FiHeart,
    title: "The Honour System",
    content: [
      {
        heading: "How it works",
        text: "Botho has no enforcement mechanism — no fines, no automated returns, no penalties. It runs entirely on trust. When someone lends you something, they are extending a piece of that trust to you. The honour system is the agreement between lender and borrower that this trust will not be abused.",
      },
      {
        heading: "Honour Score (0 – 100)",
        text: "Every user has an Honour Score that reflects their overall trustworthiness. It starts at 100 and is shaped by eight things: whether you have defaulted on loans, how often you share items with communities, whether you leave reviews after borrowing, how quickly you respond to loan requests, whether you contribute to item metadata, the ratings peers give you as a borrower, how punctually you return items, and how many items you currently have overdue. Each component rewards positive behaviour or penalises the absence of it.",
      },
      {
        heading: "Reliability Rate",
        text: "Your Reliability Rate is the percentage of borrowed items you returned on or before the due date. It is a focused metric drawn directly from your loan history. Someone who borrowed ten books and returned nine on time has a 90% reliability rate. A new user with no borrowing history starts at 100%.",
      },
      {
        heading: "Honour Tiers",
        text: "Your score places you in one of five tiers: Pillar of Community (90–100), Trusted Member (75–89), Reliable Neighbour (50–74), Member (25–49), or Novice (below 25). The tier is a quick signal for lenders deciding whether to approve a request.",
      },
      {
        heading: "Peer Reviews",
        text: "After a loan is completed, both parties can review each other. Lenders rate borrowers on a 1–5 star scale and can note the condition the item came back in (graded 1–10) with optional written feedback. These ratings feed directly into the Honour Score. Your own raw comments are never shown back to you — this is intentional, to prevent people writing reviews with one eye on avoiding retaliation.",
      },
      {
        heading: "The Borrower Report Card",
        text: "When someone requests one of your items, you will see their Borrower Report Card alongside the request. It shows their Honour Score, Reliability Rate, how many items they have borrowed and returned, their current standing (Good Standing or Delinquent), and peer reviews from previous lenders. This is the information you can use to make an informed decision. There is no automatic rejection based on score — the final call is always yours.",
      },
      {
        heading: "Delinquent status",
        text: "A user is marked Delinquent if they have an unforgiven defaulted loan on their record. This appears as a red badge on their report card. The app does allow forgiveness — if a default had a legitimate reason, was resolved, or the item was replaced, the lender can forgive the loan and remove the penalty. Delinquency is a flag, not a permanent ban.",
      },
      {
        heading: "For borrowers",
        text: "Return items in the same condition you received them. If a book has a cracked spine when it comes back, the lender will think twice before lending again. Return on time, and if something comes up, communicate early rather than going silent. Every on-time return improves your reliability rate; every overdue item costs 15 points off your Honour Score while it remains outstanding.",
      },
      {
        heading: "For lenders",
        text: "Only lend what you are genuinely comfortable lending. If a book is precious to you, keep it private — that is what the privacy setting is for. Use the report card as a guide, not a verdict. A lower score on a new account may simply mean the person is new, not that they are untrustworthy. A quick conversation before approving can tell you more than any number.",
      },
      {
        heading: "When things go wrong",
        text: "Life happens — items get delayed, damaged, or lost. The app has a dispute flow for these situations, but the best outcomes usually come from a direct, honest conversation first. Most people are decent; assume that before assuming otherwise.",
      },
      {
        heading: "The spirit of the thing",
        text: "The name Botho says it all. Lending freely and returning faithfully is what makes the community work. Every time the system is used well it makes it easier for everyone to be generous. Every time it is abused it makes people less willing to share. You are not just borrowing a book — you are upholding the culture that makes this whole thing possible.",
      },
    ],
  },
  {
    icon: FiSettings,
    title: "Settings & Profile",
    content: [
      {
        heading: "Updating Your Profile",
        text: "Go to Settings to update your Bio, Alias, Interests, and contact details. Changes take effect immediately.",
      },
      {
        heading: "Privacy Settings",
        text: "Toggle visibility for your full name and contact details. Choose whether your items are visible to Friends only, Community members, or the public.",
      },
      {
        heading: "Changing Your Password",
        text: "In Settings, use the Security section to update your password. You'll need to enter your current password to confirm.",
      },
      {
        heading: "Dark / Light Mode",
        text: "Click the sun/moon icon in the top-right navbar to switch between light and dark mode.",
      },
    ],
  },
]

function HelpModal() {
  const [open, setOpen] = useState(false)

  return (
    <DialogRoot
      open={open}
      onOpenChange={(e) => setOpen(e.open)}
      size="lg"
      scrollBehavior="inside"
    >
      <DialogTrigger asChild>
        <IconButton
          variant="ghost"
          aria-label="Help"
          size="sm"
          title="Help & Guide"
        >
          <FiHelpCircle />
        </IconButton>
      </DialogTrigger>

      <DialogContent maxH="85vh">
        <DialogHeader pb={0}>
          <DialogTitle fontSize="xl">Help & Guide</DialogTitle>
        </DialogHeader>
        <DialogCloseTrigger />

        <DialogBody pb={6}>
          {/* Overview */}
          <Box
            bg="orange.subtle"
            borderWidth="1px"
            borderColor="orange.200"
            borderRadius="lg"
            p={4}
            mb={5}
          >
            <HStack mb={2} gap={2}>
              <Icon as={FiHelpCircle} color="orange.500" />
              <Text fontWeight="bold" fontSize="md">
                What is Botho?
              </Text>
            </HStack>
            <Text fontSize="sm" color="fg.muted" lineHeight="tall">
              Botho is a community based borrowing and lending platform — a place
              where people share what they own with the people they trust. Books
              are well supported, but you can catalogue anything: tools, board
              games, equipment, clothing, whatever your circle is willing to
              share. Custom item types let you define exactly which fields matter
              for each kind of thing. You add items to your library, connect with
              friends and communities, and coordinate loans directly through the
              app — no spreadsheets, no forgotten due dates, no guessing who has
              your copy of{" "}
              <Text as="span" fontStyle="italic">
                Nineteen Eighty-Four
              </Text>
              .
            </Text>
            <Text fontSize="sm" color="fg.muted" lineHeight="tall" mt={3}>
              The name comes from a Sotho word that carries the same meaning as
              the Nguni concept of Ubuntu: a philosophy of community, mutual
              humanity, and looking out for one another.{" "}
              <Text as="span" fontStyle="italic">
                Ubuntu
              </Text>{" "}
              would have been the first choice, but a certain popular operating
              system got there first — give it a try if you haven't.
            </Text>
            <Text fontSize="sm" color="fg.muted" lineHeight="tall" mt={3}>
              The app exists because South Africans have always lent each other
              things — and that's a genuinely good thing, as long as what's
              borrowed comes back in good shape. Botho gives that habit a home:
              a place to keep track of who has what, when it's due back, and who
              in your community has something worth borrowing. Everything stays
              within the people you choose to trust.
            </Text>
          </Box>

          {/* Accordion Sections */}
          <Accordion.Root multiple variant="outline" spaceY={2}>
            {sections.map((section) => (
              <Accordion.Item key={section.title} value={section.title}>
                <Accordion.ItemTrigger px={4} py={3} cursor="pointer">
                  <HStack flex="1" gap={3}>
                    <Icon as={section.icon} color="orange.500" boxSize={4} />
                    <Text fontWeight="semibold" fontSize="sm">
                      {section.title}
                    </Text>
                    {section.badge && (
                      <Badge colorPalette="orange" size="sm" variant="subtle">
                        {section.badge}
                      </Badge>
                    )}
                  </HStack>
                  <Accordion.ItemIndicator />
                </Accordion.ItemTrigger>

                <Accordion.ItemContent>
                  <VStack align="stretch" gap={4} px={4} pb={4} pt={2}>
                    {section.content.map((item) => (
                      <Box key={item.heading}>
                        <Text
                          fontWeight="semibold"
                          fontSize="sm"
                          mb={1}
                          color="fg"
                        >
                          {item.heading}
                        </Text>
                        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
                          {item.text}
                        </Text>
                      </Box>
                    ))}
                  </VStack>
                </Accordion.ItemContent>
              </Accordion.Item>
            ))}
          </Accordion.Root>
        </DialogBody>
      </DialogContent>
    </DialogRoot>
  )
}

export default HelpModal
