# Botho User Manual

Welcome to **Botho**, your platform for sharing, lending, and managing resources within trusted communities. This guide will help you navigate the features and make the most of the application.

---

## 🚀 Getting Started

### 1. Account Creation & Login
- **Sign Up**: Create an account with your email, full name, and a secure password.
- **Login**: Access your account using your email and password.
- **Password Recovery**: If you forget your password, use the "Forgot Password" link on the login page to receive a reset link via email.

### 2. Profile Management
- **Profile Settings**: Update your **Bio**, **Alias**, and **Interests** in the User Settings.
- **Privacy**: You can toggle the visibility of your contact details and full name in the settings.
- **Visual Identity**: Your avatar is automatically generated with a unique color based on your name, featuring a themed orange ring (`#fb6635`).

---

## 👥 Communities & Friends

### 3. Communities
Communities are private groups where you can share items with trusted members.
- **Join a Community**: Search for communities and click **Join**. If a community requires approval, your request will be sent to the administrators.
- **Create a Community**: Start your own community, set its privacy (Public or Private), and decide if new members need approval.
- **Bucket Collections**: Special community-owned collections that allow any member to contribute items. These collections feature automatic cleanup of orphaned entries and shared ownership.
- **Personal Collections**: Organise items by subject, genre, category, or author. Use these for quick filtering within a community board.
- **Management**: Community admins can manage members, post announcements, and moderate shared items.

#### Item Type Restrictions (Admin Feature)
Admins can control which item types are allowed in the community pool.
- **Set Restrictions**: In Community Settings, select the item types that members are allowed to pool (e.g., only `book` and `board game`). Leave the list empty to allow all types.
- **Approval Workflow**: When a member tries to pool an item whose type is not on the allowed list, an approval request is created automatically and all admins are notified.
- **Reviewing Requests**: Admins can view pending requests in the Community dashboard under **Pending Item Requests**.
  - **Approve**: The item is added to the pool and the member is notified.
  - **Reject**: The item is not added. An optional note can explain the reason and is sent to the member.

### 4. Friends
- **Connect**: Search for users by their Public ID or name and send a friend request.
- **View Profiles**: Once connected, you can view your friends' public items and profiles.
- **Privacy Settings**: Control who can see your items (Friends only, Community members, or Public).

---

## 📦 Item Management

### 5. Adding Items
You can add items to your personal collection or directly to a community.
- **Book Search**: When adding a book, use the integrated search (Google Books) to automatically fetch metadata like Author, Title, and Cover Image.
- **Bulk Import Staging**: Quickly add your existing collection by uploading an Excel (.xlsx) or CSV file.
  - **Mapping**: Map your file's columns to fields like **Title**, **Author**, and **ISBN**.
  - **Staging UI**: Before finalising the import, review all items in a dedicated staging interface. You can correct errors, select which items to import, and see real-time feedback on data enrichment.
  - **Background Enrichment**: The system automatically enriches your books with descriptions and covers from Google Books in the background.
- **General Items**: For other resources (tools, games, etc.), manually enter the details and upload an image.
- **Custom Item Types**: Select a custom item type when adding an item. Your defined types appear as tabs in your item browser and on friend profiles.
- **Item Discovery**: Use faceted search to quickly filter items by category, genre, subject, or author. Facets are automatically sorted alphabetically to show the most relevant options first.

### 5a. Custom Item Types
Create your own item types with a tailored set of metadata fields.
- **Creating a Type**: Open **My Items** and click **New Type** (or the + icon next to the type tabs). Give it a name and select which fields to enable.
- **Available Fields**: description, brand, publisher, series, model number, edition, year, weight, dimensions, color, material, pieces count, format, age group, player count, platform, language, condition notes.
- **Scoped to You**: Your type definitions are private — they only appear in your own menus and are not visible to other users.
- **Reserved Names**: `book` and `general` are built-in types and cannot be redefined.

### 5b. Extended Item Fields
Every item supports optional extended metadata fields beyond the basic title/author/image:
- **Identity**: brand, publisher, series, model number, edition, year
- **Physical**: weight, dimensions, color, material, pieces count, format
- **Audience**: age group, player count, platform, language
- **Condition**: condition notes

These fields are shown in the item detail view and are searchable/filterable when populated.

### 6. Managing Items & Batch Actions
The **Manage Items** dashboard (available in "My Items" and "Community Board") provides a powerful interface for overseeing your resources.
- **Tabs**: View your items by category: **Catalogue** (Public), **Lost Items**, or **Private Items**.
- **Batch Actions**: Select multiple items to perform actions simultaneously:
  - **Delete**: Permanently remove items from the system.
  - **Mark as Lost/Found**: Move items to/from the "Lost Items" tab. Lost items are hidden from public search.
  - **Make Private/Public**: Toggle visibility for selected items.
  - **Sync from Archive**: Update book metadata (tags, descriptions, categories) by syncing with the local Botho Archive.
- **Bulk Add**: Access the import staging UI directly from the management dashboard.

### 6a. Interest Signals
Signal your interest in an item that is currently unavailable or on loan.
- **How to Signal**: On any item detail, click **Signal Interest**. The owner will be notified that someone wants to borrow it once it is returned.
- **Owner View**: The item card shows how many users have signalled interest, helping you prioritise returns.

### 7. Reading Log (Books Only)
Track your reading progress for any book in the system.
- **Status**: Mark books as **Reading**, **Completed**, or **Dropped**.
- **Reviews & Ratings**: Rate books (1-5 stars) and leave reviews to help others in your community.
- **Access**: Open the dedicated **Reading Log** page from the sidebar for a full overview of your progress across all statuses.

---

## 🤝 Lending & Borrowing

### 8. The Loan Process
Botho facilitates the lending of items between users and communities.
- **Request a Loan**: Browse items in your communities and click **Request Loan**. Select your desired start and end dates.
- **Approve/Reject**: The item owner will receive a notification and can accept or reject the request.
- **Ratification**: Once accepted, the requester must "Ratify" the loan to confirm they have received the item.
- **Return**: When finished, the borrower signals a return, and the owner confirms receipt to complete the loan.
- **Cancellations**: Loans can be cancelled by either party before they are ratified.

#### Loan Extensions
- **Request More Time**: Before the due date, the borrower can submit an extension request with a new proposed end date.
- **Negotiation**: The owner receives a notification and can approve or reject the extension.

#### Lost Item Forgiveness
- If an item is marked as lost, the owner can choose to forgive the borrower (selecting a forgiveness reason such as accident or trust) to prevent it from affecting the borrower's reputation score.

### 8a. Reputation & Honor System
Every user has a reputation profile that reflects their track record as a borrower and lender.
- **Honor Score**: Starts at 100. Decreases when peer reviews are negative (late returns, damage, etc.) and can recover over time.
- **Reliability Rate**: A percentage reflecting how often loans are returned on time and in good condition.
- **Delinquency Flag**: Users who consistently default on loans may be flagged as delinquent, which is visible to community admins.
- **Reviews**: After a loan is completed, both parties can leave a review. Reviews contribute directly to each other's honor score.

---

## 🔍 Search & Filtering

### 9. Global Quick Search
- **Location**: Found at the top of the **Dashboard**.
- **Function**: Searches across the entire application for **Items**, **Users**, and **Communities** simultaneously.
- **Dropdown Results**: As you type, a dropdown shows the most relevant matches. Clicking a result will take you directly to that user's profile, community board, or the specific item location.

### 10. Quick Find (Find in Catalogue)
The "Find in Catalogue" search field is a context-aware tool for filtering items and collections within specific pages.
- **Location**: Found in the toolbar of the **My Items** page, the **Community Items** tab, and **User Profiles**.
- **Context-Aware**:
    - **Items View**: Filters individual items by Title, Author, or metadata.
    - **Collections View**: Filters the names of the collections (e.g., searching "Fantasy" while in the Genre collections view).
- **Instant Response**: The search is debounced (500ms), automatically updating the grid as you type without requiring a page refresh.
- **Deep Linking**: Your search term is stored in the URL, making it easy to share a specific filtered view with others.

### 11. Notifications
- **Real-time Alerts**: Receive instant notifications for loan requests, community messages, and status updates via WebSockets.
- **Push Notifications**: Enable push notifications in your browser settings to stay updated even when the app is closed.

---

## 🛠️ Support & Troubleshooting

- **Contact Support**: If you encounter any issues, reach out to your community administrator or the system support team.
- **Logout**: For security, always log out of your session on public devices.

---

*Thank you for using Botho! Happy sharing!*