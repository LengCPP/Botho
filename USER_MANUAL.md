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
- **Item Discovery**: Use faceted search to quickly filter items by category, condition, or availability. Facets are automatically sorted to show the most relevant options first.

### 6. Reading Log (Books Only)
Track your reading progress for any book in the system.
- **Status**: Mark books as **Reading**, **Completed**, or **Dropped**.
- **Reviews & Ratings**: Rate books (1-5 stars) and leave reviews to help others in your community.

---

## 🤝 Lending & Borrowing

### 7. The Loan Process
Botho facilitates the lending of items between users and communities.
- **Request a Loan**: Browse items in your communities and click **Request Loan**. Select your desired start and end dates.
- **Approve/Reject**: The item owner will receive a notification and can accept or reject the request.
- **Ratification**: Once accepted, the requester must "Ratify" the loan to confirm they have received the item.
- **Return**: When finished, the borrower signals a return, and the owner confirms receipt to complete the loan.
- **Cancellations**: Loans can be cancelled by either party before they are ratified.

---

## 🔍 Search & Notifications

### 8. Search
- Use the global search bar to find **Items**, **Users**, and **Communities** instantly, powered by Meilisearch.
- Filter search results to find exactly what you're looking for.

### 9. Notifications
- **Real-time Alerts**: Receive instant notifications for loan requests, community messages, and status updates via WebSockets.
- **Push Notifications**: Enable push notifications in your browser settings to stay updated even when the app is closed.

---

## 🛠️ Support & Troubleshooting

- **Contact Support**: If you encounter any issues, reach out to your community administrator or the system support team.
- **Logout**: For security, always log out of your session on public devices.

---

*Thank you for using Botho! Happy sharing!*