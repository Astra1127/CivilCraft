# CivilCraft — Deployment Guide

## Quick Deploy to Vercel (Recommended)

### Step 1: Push to GitHub

```bash
# Initialize git repo (if not already)
git init

# Add all files
git add .

# Commit
git commit -m "CivilCraft Engineering Hub - ready for deployment"

# Create a GitHub repo at https://github.com/new
# Then push:
git remote add origin https://github.com/YOUR_USERNAME/civilcraft-web.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **"Add New Project"**
3. Import your `civilcraft-web` repository
4. Vercel auto-detects Vite — settings should be:
   - **Framework**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Click **"Deploy"**

### Step 3: Add Environment Variables

1. In Vercel Dashboard, go to your project
2. Click **Settings** → **Environment Variables**
3. Add:

| Key | Value | Environment |
|-----|-------|-------------|
| `VITE_PLAYFAB_TITLE_ID` | Your PlayFab Title ID | Production, Preview, Development |

4. Click **Save**
5. Go to **Deployments** → click the 3 dots on latest → **Redeploy**

### Step 4: Set Custom Domain (Optional)

1. In Vercel Dashboard → **Settings** → **Domains**
2. Add your domain (e.g., `civilcraft.com`)
3. Follow DNS instructions shown by Vercel
4. Update the `<link rel="canonical">` in `index.html`

---

## PlayFab Configuration

### Title Setup

1. Go to [developer.playfab.com](https://developer.playfab.com)
2. Create a new Title or use existing
3. Copy the **Title ID** (e.g., `A1B2C`)

### Enable Login Methods

In Game Manager → **Title Settings** → **API Features**:

- ✅ Enable **Allow client to register players**
- ✅ Enable **Login with Email Address**
- ✅ Enable **Login with PlayFab Username**

In **Client Profile Options**:

- ✅ Allow client to access **Display Name**
- ✅ Allow client to access **Email Address**
- ✅ Allow client to access **Player Statistics**
- ✅ Allow client to access **User Data (Read Only)**

### Shared Data Keys

Both website and Unity game use these PlayFab User Data keys:

| Key | Values | Description |
|-----|--------|-------------|
| `role` | `student`, `professor`, `admin`, `super_admin` | User role |
| `hasSection` | `true`, `false` | Whether user has a section |
| `sectionCode` | e.g., `CE-101` | Assigned section code |
| `displayName` | e.g., `John Doe` | Display name |
| `onboardingPendingPasswordChange` | `true`, `false` | Needs password change |

### Unity Integration

Use the **same Title ID** in your Unity game. Example C# code:

```csharp
using PlayFab;
using PlayFab.ClientModels;

// Set Title ID (must match website .env)
PlayFabSettings.TitleId = "A1B2C";

// Login
var request = new LoginWithPlayFabRequest {
    Username = username,
    Password = password,
    InfoRequestParameters = new GetPlayerCombinedInfoRequestParams {
        GetUserData = true,
        GetPlayerStatistics = true,
        GetPlayerProfile = true
    }
};
PlayFabClientAPI.LoginWithPlayFab(request, OnLoginSuccess, OnLoginFailure);

// Read role from User Data
void OnLoginSuccess(LoginResult result) {
    var userData = result.InfoResultPayload.UserData;
    if (userData.ContainsKey("role")) {
        string role = userData["role"].Value; // "student", "professor", etc.
    }
    if (userData.ContainsKey("sectionCode")) {
        string section = userData["sectionCode"].Value; // "CE-101"
    }
}
```

---

## Account Creation Flows

### Flow 1: Self-Registration (Website)
1. User visits website → clicks Register
2. Fills name, email, username, password
3. Account created in PlayFab
4. Role auto-assigned:
   - Email contains `edu.ph` → **professor**
   - Otherwise → **student**
5. Same credentials work in Unity game

### Flow 2: Bulk Upload (Admin)
1. Admin uploads Excel file (firstname, lastname, email, role)
2. Website creates PlayFab accounts
3. Onboarding email sent with username + default password
4. Users can login on both website and game

### Flow 3: Game Registration (Unity)
1. User registers in Unity game
2. PlayFab account created
3. Same credentials work on website

---

## Testing Checklist

- [ ] Website loads on Vercel URL
- [ ] Login page shows "PlayFab Connected" (not Demo Mode)
- [ ] Registration creates account in PlayFab
- [ ] Login works with registered account
- [ ] Same account works in Unity game
- [ ] Student sees student dashboard
- [ ] Professor sees professor dashboard
- [ ] Admin sees admin dashboard
- [ ] Role auto-detection works (edu.ph → professor)
- [ ] Bulk upload creates PlayFab accounts
- [ ] Transactions filtered by role
- [ ] Feedback: students/professors create, admins view
- [ ] Sections page loads correctly
- [ ] Mobile responsive layout works
- [ ] Landing page renders correctly

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Demo Mode" showing | Check `VITE_PLAYFAB_TITLE_ID` in Vercel env vars, redeploy |
| Login fails | Verify login methods enabled in PlayFab |
| Registration fails | Enable "Allow client to register" in PlayFab API Features |
| Wrong role after login | Check User Data keys in PlayFab player profile |
| Blank page on refresh | `vercel.json` rewrites handle SPA routing — should work automatically |
| Images not loading | Check files exist in `public/` folder and paths start with `/` |
| Build fails on Vercel | Run `npm run build` locally first to catch errors |
| CORS errors | PlayFab client API allows browser requests by default |
