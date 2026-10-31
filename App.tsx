import React, { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  SafeAreaView,
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { supabase, isSupabaseConfigured } from "./src/lib/supabase";
import { CATEGORIES, asoReport, matchesSearch, matchesListingFilters, topByNumber, topByDate } from "./src/shared/mas-core";
import type { Listing } from "./src/shared/mas-core";

type Tab = "Explore" | "Social" | "Develop" | "Profile";
type SocialSection = "Feed" | "Messages" | "Connections" | "Activity" | "Collabo" | "Investors" | "Grants" | "Crowdfund";

const COLORS = {
  background: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceAlt: "#F3F3F3",
  border: "#E1E1E1",
  text: "#17191C",
  muted: "#808080",
  accent: "#188038",
  accentSoft: "#E3F3E7",
  green: "#188038",
};

type StoreApp = { id: string; name: string; category: string; tagline?: string; description: string; mark: string; color: string; slug?: string; kind?: string; developer?: string; downloads?: number; rating?: number; ratingCount?: number; iconUrl?: string | null; createdAt?: string; };
type FeedPost = { id: string; name: string; tag: string; text: string; createdAt?: string; authorId?: string; mediaUrl?: string | null; mediaType?: "image" | "video" | null };
type SelectedMedia = { uri: string; type: "image" | "video"; fileName: string; mimeType: string };
type UtilityScreen = "none" | "library" | "notifications" | "settings";

// These fixed developer IDs are the demo catalogue seeded by the prototype migration.
// Keep demo listings out of the native live catalogue without deleting production data.
const SEEDED_DEMO_DEVELOPER_IDS = [
  "11111111-1111-4111-8111-111111111101",
  "11111111-1111-4111-8111-111111111102",
  "11111111-1111-4111-8111-111111111103",
  "11111111-1111-4111-8111-111111111104",
  "11111111-1111-4111-8111-111111111105",
  "11111111-1111-4111-8111-111111111106",
  "11111111-1111-4111-8111-111111111107",
  "11111111-1111-4111-8111-111111111108",
] as const

// The live Supabase project has no private kyc-docs bucket; keep manual ID upload disabled until it is provisioned safely.
const MANUAL_KYC_UPLOAD_ENABLED = false;;

type NativePreviewCard = { title: string; description: string; status: string; action: string };
const nativeDeveloperPreviews: Record<string, NativePreviewCard[]> = {
  "Quality checks": [
    { title: "Listing information", description: "Product name, category, short description and full description.", status: "Checklist", action: "Review listing fields" },
    { title: "Release package", description: "Confirm the Android package, version and downloadable release are consistent.", status: "Checklist", action: "Review release requirements" },
    { title: "Store assets", description: "Prepare an app icon, screenshots and any required promotional media.", status: "Checklist", action: "Review asset requirements" },
    { title: "Privacy and permissions", description: "Explain data collection, permissions and privacy practices before submission.", status: "Checklist", action: "Review privacy requirements" },
  ],
  "Developer resources": [
    { title: "Publishing guide", description: "Prepare your listing, release package, screenshots and release notes.", status: "Guide", action: "Open publishing checklist" },
    { title: "Listing quality", description: "Write clear descriptions and use original, readable store assets.", status: "Guide", action: "Open quality checks" },
    { title: "Security basics", description: "Never ship provider secrets or privileged backend keys inside a mobile app.", status: "Security", action: "Review security notes" },
    { title: "Malawi developer community", description: "Use Social to share projects, find collaborators and discuss opportunities.", status: "Community", action: "Open Social" },
  ],
  "Testing": [
    { title: "Launch and navigation", description: "Verify the app opens and every tab and back action works on a real Android phone.", status: "Manual test", action: "Record test status" },
    { title: "Account flows", description: "Check signed-out, signed-in, expired-session and sign-out states.", status: "Integration test", action: "Review account test" },
    { title: "Store actions", description: "Test listing details, saving, reviews and secure download links.", status: "Integration test", action: "Review store test" },
    { title: "Social actions", description: "Test posts, media, comments, reactions, connections and direct messages.", status: "Integration test", action: "Review Social test" },
  ],
  "Console settings": [
    { title: "Developer profile", description: "Manage public developer identity and profile information.", status: "Account", action: "Open public profile" },
    { title: "Publishing preferences", description: "Review default listing and release preferences before publishing.", status: "Preferences", action: "Review publishing checklist" },
    { title: "Notifications", description: "Review MAS account notifications in the Profile tab.", status: "Available", action: "Open notifications" },
  ],
  "Security": [
    { title: "Mobile client keys", description: "Only public Supabase client configuration belongs in the app. Keep service-role and provider secrets server-side.", status: "Security rule", action: "Review security rule" },
    { title: "Session handling", description: "Sessions are persisted securely through the configured native storage adapter; verify sign-in and sign-out on device.", status: "Test required", action: "Review account tests" },
    { title: "Row-level security", description: "Production data access depends on correct Supabase RLS policies and storage permissions.", status: "Backend check", action: "Review backend checks" },
    { title: "Account security console", description: "Use the existing MAS security console for account-level controls that are not exposed natively.", status: "Secure web handoff", action: "Open security console" },
  ],
  "Store management": [
    { title: "Published catalogue", description: "Published listings are shown in Explore when the MAS backend is configured.", status: "Native", action: "Open Explore" },
    { title: "Product details", description: "Listing pages show descriptions, versions, ratings and reviews where data is available.", status: "Native", action: "Review listing screens" },
    { title: "Developer listings", description: "Create and review product drafts in the native Developer Space.", status: "Native", action: "Open My applications" },
  ],
  "Developer assistant": [
    { title: "Prepare a listing", description: "Get your product name, category, tagline, description and release information ready.", status: "Workflow", action: "Start a product draft" },
    { title: "Improve store quality", description: "Use concise descriptions, clear screenshots and accurate feature claims.", status: "Guidance", action: "Open quality checks" },
    { title: "Plan a release", description: "Check version details, release notes and package readiness before submission.", status: "Workflow", action: "Open publishing checklist" },
    { title: "AI assistant", description: "Open the existing MAS assistant for tasks that require the connected web service. This native screen does not simulate AI answers.", status: "Secure web handoff", action: "Open assistant console" },
  ],
  "Team management": [
    { title: "Team roles", description: "Invite teammates and manage their recorded role and status. Actual access still depends on backend membership enforcement.", status: "Native workflow", action: "Review team access" },
    { title: "Access review", description: "Only grant collaborators the permissions they need for their work.", status: "Security", action: "Review access guidance" },
  ],
  "Promote a product": [
    { title: "Product description", description: "Prepare a concise value proposition and the audience your product serves.", status: "Preparation", action: "Review listing" },
    { title: "Campaign assets", description: "Prepare original screenshots, a logo and promotional copy.", status: "Preparation", action: "Review asset requirements" },
    { title: "Campaign analytics", description: "Create and manage native promotion campaigns and review server-reported impressions, clicks, spend and budget. Campaign approval and payment are separate server-side steps.", status: "Native campaign workflow", action: "Open promotion campaign manager" },
  ],
  "Spotlight": [
    { title: "Featured product readiness", description: "Keep your listing complete, current and easy to understand.", status: "Preparation", action: "Open quality checks" },
    { title: "Feature submission", description: "Submit a Spotlight application and track its review status in the native app.", status: "Native workflow", action: "Open Spotlight applications" },
  ],
  "My public profile": [
    { title: "Developer identity", description: "Your public profile helps people understand who builds and maintains a product.", status: "Profile", action: "Review profile" },
    { title: "Published products", description: "Published listings connect your developer identity with your work on MAS.", status: "Catalogue", action: "Open My applications" },
    { title: "Community presence", description: "Use MAS Social to introduce projects and connect with other builders.", status: "Community", action: "Open Social" },
  ],
};

function NativeIcon({ name, color, size = 20 }: { name: "menu" | "apps" | "book" | "bell" | "user" | "users" | "grid" | "settings" | "search"; color: string; size?: number }) {
  const line = { backgroundColor: color, borderRadius: 2 } as const;
  if (name === "search") return <View style={{ width: size, height: size, justifyContent: "center", alignItems: "center" }}><View style={{ width: size*0.62, height: size*0.62, borderWidth: 1.8, borderColor: color, borderRadius: size, marginRight: 4, marginBottom: 4 }} /><View style={{ position: "absolute", width: size*0.38, height: 1.8, backgroundColor: color, right: 0, bottom: 2, transform: [{ rotate: "45deg" }] }} /></View>;
  if (name === "menu") return <View style={{ width: size, height: size, justifyContent: "center", gap: 4 }}><View style={[line,{height:2,width:size}]} /><View style={[line,{height:2,width:size}]} /><View style={[line,{height:2,width:size}]} /></View>;
  if (name === "apps" || name === "grid") return <View style={{ width: size, height: size, flexDirection: "row", flexWrap: "wrap", gap: 3, alignContent: "center", justifyContent: "center" }}>{[0,1,2,3].map((i)=><View key={i} style={{width:(size-5)/2,height:(size-5)/2,borderWidth:1.8,borderColor:color,borderRadius:2}} />)}</View>;
  if (name === "book") return <View style={{ width: size*0.78, height: size, borderWidth:1.8,borderColor:color,borderRadius:3,flexDirection:"row" }}><View style={{width:2,backgroundColor:color,marginLeft:4,marginRight:3}}/><View style={{flex:1}}/></View>;
  if (name === "bell") return <View style={{width:size*0.82,height:size*0.9,alignItems:"center",justifyContent:"flex-end"}}><View style={{width:size*0.68,height:size*0.68,borderWidth:1.8,borderColor:color,borderTopLeftRadius:size/2,borderTopRightRadius:size/2,borderBottomLeftRadius:4,borderBottomRightRadius:4}}/><View style={{width:size*0.94,height:2,backgroundColor:color,marginTop:1}}/><View style={{width:4,height:4,borderRadius:2,backgroundColor:color,marginTop:1}}/></View>;
  if (name === "user") return <View style={{width:size,height:size,alignItems:"center",justifyContent:"flex-end"}}><View style={{width:size*0.34,height:size*0.34,borderRadius:size,borderWidth:1.8,borderColor:color,marginBottom:2}}/><View style={{width:size*0.82,height:size*0.4,borderWidth:1.8,borderColor:color,borderTopLeftRadius:size,borderTopRightRadius:size,borderBottomWidth:0}}/></View>;
  if (name === "users") return <View style={{width:size,height:size,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:2}}><View style={{alignItems:"center",justifyContent:"flex-end",height:size*0.9,width:size*0.43}}><View style={{width:size*0.28,height:size*0.28,borderRadius:size,borderWidth:1.6,borderColor:color}}/><View style={{width:size*0.42,height:size*0.3,borderWidth:1.6,borderColor:color,borderTopLeftRadius:size,borderTopRightRadius:size,borderBottomWidth:0,marginTop:2}}/></View><View style={{alignItems:"center",justifyContent:"flex-end",height:size*0.9,width:size*0.43}}><View style={{width:size*0.28,height:size*0.28,borderRadius:size,borderWidth:1.6,borderColor:color}}/><View style={{width:size*0.42,height:size*0.3,borderWidth:1.6,borderColor:color,borderTopLeftRadius:size,borderTopRightRadius:size,borderBottomWidth:0,marginTop:2}}/></View></View>;
  if (name === "settings") return <View style={{width:size,height:size,alignItems:"center",justifyContent:"center"}}><View style={{width:size*0.72,height:size*0.72,borderRadius:size,borderWidth:2,borderColor:color,alignItems:"center",justifyContent:"center"}}><View style={{width:size*0.24,height:size*0.24,borderRadius:size,borderWidth:1.8,borderColor:color}}/></View></View>;
  return <View style={{width:size,height:size,justifyContent:"center",gap:4}}><View style={{height:2,width:size,backgroundColor:color}}/><View style={{height:2,width:size*0.72,backgroundColor:color}}/><View style={{height:2,width:size*0.86,backgroundColor:color}}/></View>;
}

export default function App() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isTabletLayout = windowWidth >= 768;
  const contentMaxWidth = isTabletLayout ? 1120 : 960;
  const drawerWidth = Math.min(isTabletLayout ? 420 : 360, windowWidth * 0.88);
  const [tab, setTab] = useState<Tab>("Explore");
  const [selectedApp, setSelectedApp] = useState<StoreApp | null>(null);
  const [sectionPostDraft, setSectionPostDraft] = useState("");
  const [sectionPosting, setSectionPosting] = useState(false);
  const [selectedAppDetails, setSelectedAppDetails] = useState<any>(null);
  const [selectedVersions, setSelectedVersions] = useState<any[]>([]);
  const [selectedScreenshotUrls, setSelectedScreenshotUrls] = useState<string[]>([]);
  const [selectedReviews, setSelectedReviews] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewDraft, setReviewDraft] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [developerScreen, setDeveloperScreen] = useState<string | null>(null);
  const [developerRows, setDeveloperRows] = useState<any[]>([]);
  const [developerReviews, setDeveloperReviews] = useState<any[]>([]);
  const [developerProfileInfo, setDeveloperProfileInfo] = useState<any>(null);
  const [reviewReplies, setReviewReplies] = useState<Record<string, string>>({});
  const [reviewReplySaving, setReviewReplySaving] = useState<string | null>(null);
  const [developerLoading, setDeveloperLoading] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftTagline, setDraftTagline] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftCategory, setDraftCategory] = useState("Tools");
  const [draftKind, setDraftKind] = useState<"app" | "website">("app");
  const [draftWebsiteUrl, setDraftWebsiteUrl] = useState("");
  const [draftSaving, setDraftSaving] = useState(false);
  const [editingListingId, setEditingListingId] = useState<string | null>(null);
  const [editingListingStatus, setEditingListingStatus] = useState<string | null>(null);
  const [draftIcon, setDraftIcon] = useState<{ uri: string; fileName: string; mimeType: string } | null>(null);
  const [draftBanner, setDraftBanner] = useState<{ uri: string; fileName: string; mimeType: string } | null>(null);
  const [existingBannerUrl, setExistingBannerUrl] = useState<string | null>(null);
  const [draftReleaseFile, setDraftReleaseFile] = useState<{ uri: string; name: string; mimeType: string; size: number | null } | null>(null);
  const [draftVersion, setDraftVersion] = useState("1.0.0");
  const [draftChangelog, setDraftChangelog] = useState("First release");
  const [draftScreenshots, setDraftScreenshots] = useState<{ uri: string; fileName: string; mimeType: string }[]>([]);
  const [existingScreenshots, setExistingScreenshots] = useState<string[]>([]);
  const [draftKeywords, setDraftKeywords] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [utilityScreen, setUtilityScreen] = useState<UtilityScreen>("none");
  const [utilityLoading, setUtilityLoading] = useState(false);
  const [accountDisplayName, setAccountDisplayName] = useState("");
  const [accountDeveloperName, setAccountDeveloperName] = useState("");
  const [accountBio, setAccountBio] = useState("");
  const [accountCompanyName, setAccountCompanyName] = useState("");
  const [accountLocation, setAccountLocation] = useState("");
  const [accountContactEmail, setAccountContactEmail] = useState("");
  const [accountSkills, setAccountSkills] = useState("");
  const [accountWebsiteUrl, setAccountWebsiteUrl] = useState("");
  const [accountGithubUrl, setAccountGithubUrl] = useState("");
  const [accountPortfolioUrl, setAccountPortfolioUrl] = useState("");
  const [accountLinkedinUrl, setAccountLinkedinUrl] = useState("");
  const [accountFacebookUrl, setAccountFacebookUrl] = useState("");
  const [accountAvatarUri, setAccountAvatarUri] = useState<string | null>(null);
  const [accountProfileSaving, setAccountProfileSaving] = useState(false);
  const [libraryData, setLibraryData] = useState<{ saved: any[]; installed: any[] }>({ saved: [], installed: [] });
  const [notificationItems, setNotificationItems] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [kindFilter, setKindFilter] = useState<"all" | "app" | "website">("all");
  const [socialSection, setSocialSection] = useState<SocialSection>("Feed");
  const [socialSearchOpen, setSocialSearchOpen] = useState(false);
  const [socialSearchQuery, setSocialSearchQuery] = useState("");
  const [activeConversationUserId, setActiveConversationUserId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ id: string; sender_id: string; recipient_id: string; body: string; created_at: string; read_at: string | null }[]>([]);
  const [conversationPreviews, setConversationPreviews] = useState<{ userId: string; name: string; body: string; createdAt: string; unread: number }[]>([]);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageSending, setMessageSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [apps, setApps] = useState<StoreApp[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [catalogueLoading, setCatalogueLoading] = useState(false);
  const [catalogueSource, setCatalogueSource] = useState<"unconfigured" | "live" | "error">("unconfigured");
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedSource, setFeedSource] = useState<"unconfigured" | "live" | "error">("unconfigured");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accentColor, setAccentColor] = useState(COLORS.accent);
  const [accentLoaded, setAccentLoaded] = useState(false);
  const [postDraft, setPostDraft] = useState("");
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia | null>(null);
  const [posting, setPosting] = useState(false);
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [likedPostIds, setLikedPostIds] = useState<string[]>([]);
  const [openCommentsPostId, setOpenCommentsPostId] = useState<string | null>(null);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, { id: string; name: string; body: string; createdAt: string }[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentLoadingPostId, setCommentLoadingPostId] = useState<string | null>(null);
  const [commentSendingPostId, setCommentSendingPostId] = useState<string | null>(null);
  const [connectingPostIds, setConnectingPostIds] = useState<string[]>([]);
  const [socialConnections, setSocialConnections] = useState<any[]>([]);
  const [socialConnectionsLoading, setSocialConnectionsLoading] = useState(false);
  const [socialNotifications, setSocialNotifications] = useState<any[]>([]);
  const [socialNotificationsLoading, setSocialNotificationsLoading] = useState(false);
  const [investmentOpportunities, setInvestmentOpportunities] = useState<any[]>([]);
  const [investmentLoading, setInvestmentLoading] = useState(false);
  const [investmentSaving, setInvestmentSaving] = useState(false);
  const [investmentTitle, setInvestmentTitle] = useState("");
  const [investmentDescription, setInvestmentDescription] = useState("");
  const [investmentIndustry, setInvestmentIndustry] = useState("Technology");
  const [investmentStage, setInvestmentStage] = useState("idea");
  const [investmentGoal, setInvestmentGoal] = useState("");
  const [investmentCurrency, setInvestmentCurrency] = useState("MWK");
  const [investmentUse, setInvestmentUse] = useState("");
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [teamActivity, setTeamActivity] = useState<any[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamSaving, setTeamSaving] = useState(false);
  const [teamEmail, setTeamEmail] = useState("");
  const [teamRole, setTeamRole] = useState("editor");
  const [spotlightApplications, setSpotlightApplications] = useState<any[]>([]);
  const [spotlightLoading, setSpotlightLoading] = useState(false);
  const [spotlightSaving, setSpotlightSaving] = useState(false);
  const [spotlightOpportunity, setSpotlightOpportunity] = useState("App Spotlight");
  const [spotlightListingId, setSpotlightListingId] = useState("");
  const [spotlightPitch, setSpotlightPitch] = useState("");
  const [promotionListings, setPromotionListings] = useState<any[]>([]);
  const [promotionCampaigns, setPromotionCampaigns] = useState<any[]>([]);
  const [promotionLoading, setPromotionLoading] = useState(false);
  const [promotionSaving, setPromotionSaving] = useState(false);
  const [promotionListingId, setPromotionListingId] = useState("");
  const [promotionName, setPromotionName] = useState("");
  const [promotionPlacement, setPromotionPlacement] = useState<"featured" | "search" | "banner">("featured");
  const [promotionBudget, setPromotionBudget] = useState("10000");
  const [promotionDays, setPromotionDays] = useState("7");
  const [promotionLocation, setPromotionLocation] = useState("All Malawi");
  const [featureRequests, setFeatureRequests] = useState<any[]>([]);
  const [featureRequestsLoading, setFeatureRequestsLoading] = useState(false);
  const [featureRequestSaving, setFeatureRequestSaving] = useState(false);
  const [featureRequestTitle, setFeatureRequestTitle] = useState("");
  const [featureRequestBody, setFeatureRequestBody] = useState("");
  const [featureRequestVoteIds, setFeatureRequestVoteIds] = useState<string[]>([]);
  const [featureRequestVotingId, setFeatureRequestVotingId] = useState<string | null>(null);
  const [betaTesters, setBetaTesters] = useState<any[]>([]);
  const [betaFeedback, setBetaFeedback] = useState<any[]>([]);
  const [verificationPhone, setVerificationPhone] = useState("");
  const [verificationFullName, setVerificationFullName] = useState("");
  const [verificationIdType, setVerificationIdType] = useState("National ID");
  const [verificationIdNumber, setVerificationIdNumber] = useState("");
  const [verificationDocument, setVerificationDocument] = useState<{ uri: string; name: string; mimeType: string; size: number | null } | null>(null);
  const [verificationStatus, setVerificationStatus] = useState("none");
  const [verificationSaving, setVerificationSaving] = useState(false);
  const [diditLoading, setDiditLoading] = useState(false);
  const [proSubscription, setProSubscription] = useState<any>(null);
  const [proLoading, setProLoading] = useState(false);
  const [analyticsRange, setAnalyticsRange] = useState<"7d" | "30d" | "90d">("30d");
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsProAllowed, setAnalyticsProAllowed] = useState(false);
  const [analyticsStats, setAnalyticsStats] = useState<{
    views: number; installs: number; viewsByDevice: Record<string, number>; installsByDevice: Record<string, number>;
    viewsByCountry: Record<string, number>; installsByCountry: Record<string, number>; byListing: Record<string, { views: number; installs: number }>;
  }>({ views: 0, installs: 0, viewsByDevice: {}, installsByDevice: {}, viewsByCountry: {}, installsByCountry: {}, byListing: {} });
  const [betaLoading, setBetaLoading] = useState(false);
  const [betaSaving, setBetaSaving] = useState(false);
  const [betaListingId, setBetaListingId] = useState("");
  const [betaTesterEmail, setBetaTesterEmail] = useState("");
  const [betaChannel, setBetaChannel] = useState("private");
  const [portfolioProjects, setPortfolioProjects] = useState<any[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioSaving, setPortfolioSaving] = useState(false);
  const [portfolioTitle, setPortfolioTitle] = useState("");
  const [portfolioDescription, setPortfolioDescription] = useState("");
  const [portfolioType, setPortfolioType] = useState("website");
  const [portfolioUrl, setPortfolioUrl] = useState("");

  useEffect(() => {
    if (developerScreen !== "Developer resources") return;
    let active = true;
    const loadFeatureRequests = async () => {
      if (!isSupabaseConfigured) {
        setFeatureRequests([]);
        setFeatureRequestVoteIds([]);
        setFeatureRequestsLoading(false);
        return;
      }
      setFeatureRequestsLoading(true);
      const { data, error } = await supabase.from("feature_requests")
        .select("id,title,body,status,vote_count,created_at")
        .order("vote_count", { ascending: false }).limit(30);
      if (!active) return;
      setFeatureRequests(data ?? []);
      if (error) {
        setFeatureRequestVoteIds([]);
        showNotice(error.message || "Could not load feature requests.");
      } else {
        const { data: authData } = await supabase.auth.getUser();
        if (!active) return;
        if (authData.user && data?.length) {
          const { data: votes, error: votesError } = await supabase.from("feature_votes")
            .select("request_id").eq("user_id", authData.user.id)
            .in("request_id", data.map((item: any) => item.id));
          if (!active) return;
          setFeatureRequestVoteIds(votesError ? [] : (votes ?? []).map((vote: any) => vote.request_id));
          if (votesError) showNotice(votesError.message || "Could not load your feature votes.");
        } else {
          setFeatureRequestVoteIds([]);
        }
      }
      setFeatureRequestsLoading(false);
    };
    void loadFeatureRequests().catch(() => {
      if (active) {
        setFeatureRequestsLoading(false);
        setFeatureRequestVoteIds([]);
        showNotice("Could not load feature requests. Check your connection and try again.");
      }
    });
    return () => { active = false; };
  }, [developerScreen]);

  const submitFeatureRequest = async () => {
    const title = featureRequestTitle.trim();
    if (title.length < 5) { showNotice("Give your feature request a title of at least 5 characters."); return; }
    if (!isSupabaseConfigured) { showNotice("Feature requests need the MAS backend configuration."); return; }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in to submit a feature request."); setTab("Profile"); return; }
    setFeatureRequestSaving(true);
    const { data, error } = await supabase.from("feature_requests")
      .insert({ user_id: authData.user.id, title, body: featureRequestBody.trim() || null })
      .select("id,title,body,status,vote_count,created_at").single();
    setFeatureRequestSaving(false);
    if (error || !data) { showNotice(error?.message || "Feature request was not submitted."); return; }
    setFeatureRequests((items) => [data, ...items].sort((a,b) => Number(b.vote_count || 0) - Number(a.vote_count || 0)).slice(0,30));
    setFeatureRequestTitle(""); setFeatureRequestBody("");
    showNotice("Feature request submitted.");
  };

  const toggleFeatureRequestVote = async (item: any) => {
    if (!isSupabaseConfigured) { showNotice("Feature voting needs the MAS backend configuration."); return; }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in to vote for a feature request."); setTab("Profile"); return; }
    const alreadyVoted = featureRequestVoteIds.includes(item.id);
    setFeatureRequestVotingId(item.id);
    const result = alreadyVoted
      ? await supabase.from("feature_votes").delete().eq("request_id", item.id).eq("user_id", authData.user.id)
      : await supabase.from("feature_votes").insert({ request_id: item.id, user_id: authData.user.id });
    if (result.error) {
      setFeatureRequestVotingId(null);
      showNotice(result.error.code === "23505" ? "You have already voted for this request." : result.error.message || "Could not update your vote.");
      return;
    }
    const { data: refreshed, error: refreshError } = await supabase.from("feature_requests")
      .select("vote_count").eq("id", item.id).single();
    setFeatureRequestVotingId(null);
    if (refreshError) { showNotice(refreshError.message || "Vote saved, but the count could not refresh."); return; }
    setFeatureRequestVoteIds((ids) => alreadyVoted ? ids.filter((id) => id !== item.id) : [...ids, item.id]);
    setFeatureRequests((items) => items.map((request) => request.id === item.id ? { ...request, vote_count: refreshed.vote_count } : request)
      .sort((left, right) => Number(right.vote_count || 0) - Number(left.vote_count || 0)));
    showNotice(alreadyVoted ? "Your vote was removed." : "Your vote was counted.");
  };

  useEffect(() => {
    if (developerScreen !== "Promote a product") return;
    let active = true;
    const loadPromotions = async () => {
      if (!isSupabaseConfigured) { setPromotionListings([]); setPromotionCampaigns([]); setPromotionLoading(false); return; }
      setPromotionLoading(true);
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !authData.user) {
        setPromotionListings([]); setPromotionCampaigns([]); setPromotionLoading(false);
        showNotice("Sign in to manage promotion campaigns."); return;
      }
      const [listingsResult, campaignsResult] = await Promise.all([
        supabase.from("listings").select("id,name,status").eq("developer_id", authData.user.id).order("updated_at", { ascending: false }),
        supabase.from("promotions").select("id,listing_id,name,kind,budget_mwk,spent_mwk,impressions,clicks,target_location,starts_at,ends_at,status,created_at").eq("owner_id", authData.user.id).order("created_at", { ascending: false }).limit(100),
      ]);
      if (!active) return;
      setPromotionListings(listingsResult.data ?? []); setPromotionCampaigns(campaignsResult.data ?? []);
      if (listingsResult.error) showNotice(listingsResult.error.message || "Could not load your products for promotion.");
      if (campaignsResult.error) showNotice(campaignsResult.error.message || "Could not load your campaigns.");
      setPromotionLoading(false);
    };
    void loadPromotions().catch(() => { if (active) { setPromotionLoading(false); showNotice("Could not load promotions. Check your connection and try again."); } });
    return () => { active = false; };
  }, [developerScreen]);

  const submitPromotionCampaign = async () => {
    if (!isSupabaseConfigured) { showNotice("Promotion campaigns need the MAS backend configuration."); return; }
    if (!promotionListingId) { showNotice("Choose a product to promote."); return; }
    const amount = Number(promotionBudget);
    if (!Number.isFinite(amount) || amount < 1000) { showNotice("Set a campaign budget of at least MK1,000."); return; }
    const days = Number(promotionDays);
    if (!Number.isFinite(days) || days < 1 || days > 90) { showNotice("Campaign duration must be between 1 and 90 days."); return; }
    if (!promotionListings.some((item) => item.id === promotionListingId)) { showNotice("Choose one of your own products."); return; }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in to submit a campaign."); setTab("Profile"); return; }
    setPromotionSaving(true);
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + days * 24 * 60 * 60 * 1000);
    const { data, error } = await supabase.from("promotions").insert({
      owner_id: authData.user.id, listing_id: promotionListingId,
      name: promotionName.trim() || "Promotion campaign", kind: promotionPlacement,
      budget_mwk: amount, target_location: promotionLocation,
      starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), status: "pending",
    }).select("id,listing_id,name,kind,budget_mwk,spent_mwk,impressions,clicks,target_location,starts_at,ends_at,status,created_at").single();
    setPromotionSaving(false);
    if (error || !data) { showNotice(error?.message || "Campaign was not submitted."); return; }
    setPromotionCampaigns((items) => [data, ...items]); setPromotionName("");
    showNotice("Campaign submitted for review. No payment was taken by this action.");
  };

  const pausePromotionCampaign = async (campaign: any) => {
    if (!isSupabaseConfigured) return;
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in to manage campaigns."); return; }
    const { data, error } = await supabase.from("promotions").update({ status: "paused" })
      .eq("id", campaign.id).eq("owner_id", authData.user.id).select("id,status").maybeSingle();
    if (error || !data) { showNotice(error?.message || "Only the campaign owner can pause this campaign."); return; }
    setPromotionCampaigns((items) => items.map((item) => item.id === campaign.id ? { ...item, status: "paused" } : item));
    showNotice("Campaign paused.");
  };

  useEffect(() => {
    if (developerScreen !== "Analytics" || !isSupabaseConfigured) return;
    let active = true;
    const loadAnalytics = async () => {
      setAnalyticsLoading(true);
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        if (active) { setAnalyticsStats({ views: 0, installs: 0, viewsByDevice: {}, installsByDevice: {}, viewsByCountry: {}, installsByCountry: {}, byListing: {} }); setAnalyticsLoading(false); showNotice("Sign in to view product analytics."); }
        return;
      }
      const { data: subscription, error: subscriptionError } = await supabase.from("subscriptions").select("status,current_period_end").eq("user_id", authData.user.id).maybeSingle();
      if (!active) return;
      if (subscriptionError) { setAnalyticsLoading(false); showNotice(subscriptionError.message || "Could not verify Developer Pro access."); return; }
      const periodEnd = subscription?.current_period_end ? Date.parse(subscription.current_period_end) : null;
      const hasPro = (subscription?.status === "active" && (periodEnd === null || periodEnd > Date.now())) ||
        (subscription?.status === "cancelled" && periodEnd !== null && periodEnd > Date.now());
      setAnalyticsProAllowed(hasPro);
      if (!hasPro) {
        setAnalyticsStats({ views: 0, installs: 0, viewsByDevice: {}, installsByDevice: {}, viewsByCountry: {}, installsByCountry: {}, byListing: {} });
        setAnalyticsLoading(false);
        return;
      }
      const { data: listings, error: listingsError } = await supabase.from("listings").select("id").eq("developer_id", authData.user.id);
      if (!active) return;
      if (listingsError) { setAnalyticsLoading(false); showNotice(listingsError.message || "Could not load your analytics listings."); return; }
      const ids = (listings ?? []).map((item: any) => item.id).filter(Boolean);
      if (!ids.length) {
        setAnalyticsStats({ views: 0, installs: 0, viewsByDevice: {}, installsByDevice: {}, viewsByCountry: {}, installsByCountry: {}, byListing: {} });
        setAnalyticsLoading(false);
        return;
      }
      const days = Number(analyticsRange.replace("d", ""));
      const end = new Date();
      const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
      const startIso = start.toISOString();
      const endIso = end.toISOString();
      const [viewsResult, installsResult] = await Promise.all([
        supabase.from("view_events").select("created_at,device,country,listing_id").in("listing_id", ids).gte("created_at", startIso).lte("created_at", endIso),
        supabase.from("install_events").select("created_at,device,country,listing_id").in("listing_id", ids).gte("created_at", startIso).lte("created_at", endIso),
      ]);
      if (!active) return;
      if (viewsResult.error || installsResult.error) {
        setAnalyticsLoading(false);
        showNotice(viewsResult.error?.message || installsResult.error?.message || "Could not load analytics events.");
        return;
      }
      const aggregate = (rows: any[], key: "device" | "country") => rows.reduce((acc: Record<string, number>, row: any) => {
        const label = String(row[key] || "Unknown");
        acc[label] = (acc[label] || 0) + 1;
        return acc;
      }, {});
      const byListing: Record<string, { views: number; installs: number }> = {};
      ids.forEach((id: string) => { byListing[id] = { views: 0, installs: 0 }; });
      (viewsResult.data ?? []).forEach((row: any) => { if (byListing[row.listing_id]) byListing[row.listing_id].views += 1; });
      (installsResult.data ?? []).forEach((row: any) => { if (byListing[row.listing_id]) byListing[row.listing_id].installs += 1; });
      setAnalyticsStats({
        views: (viewsResult.data ?? []).length,
        installs: (installsResult.data ?? []).length,
        viewsByDevice: aggregate(viewsResult.data ?? [], "device"),
        installsByDevice: aggregate(installsResult.data ?? [], "device"),
        viewsByCountry: aggregate(viewsResult.data ?? [], "country"),
        installsByCountry: aggregate(installsResult.data ?? [], "country"),
        byListing,
      });
      setAnalyticsLoading(false);
    };
    void loadAnalytics().catch(() => { if (active) { setAnalyticsLoading(false); showNotice("Could not load analytics."); } });
    return () => { active = false; };
  }, [developerScreen, analyticsRange]);

  useEffect(() => {
    if (developerScreen !== "Developer Pro" || !isSupabaseConfigured) return;
    let active = true;
    setProLoading(true);
    void (async () => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        if (active) { setProSubscription(null); setProLoading(false); showNotice("Sign in to view your Developer Pro subscription."); }
        return;
      }
      const { data, error } = await supabase.from("subscriptions").select("status,current_period_end").eq("user_id", authData.user.id).maybeSingle();
      if (!active) return;
      setProSubscription(data ?? null);
      setProLoading(false);
      if (error) showNotice(error.message || "Could not load Developer Pro status.");
    })().catch(() => { if (active) { setProLoading(false); showNotice("Could not load Developer Pro status."); } });
    return () => { active = false; };
  }, [developerScreen]);

  useEffect(() => {
    if (developerScreen !== "Verification" || !isSupabaseConfigured) return;
    let active = true;
    void (async () => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        if (active) showNotice("Sign in to view your verification status.");
        return;
      }
      const { data, error } = await supabase.from("profiles").select("phone,kyc_status").eq("id", authData.user.id).maybeSingle();
      if (!active) return;
      if (error) showNotice(error.message || "Could not load verification status.");
      setVerificationPhone(data?.phone || "");
      setVerificationStatus(data?.kyc_status || "none");
    })().catch(() => { if (active) showNotice("Could not load verification status."); });
    return () => { active = false; };
  }, [developerScreen]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setUserEmail(data.session?.user.email ?? null);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null);
    });
    const handleUrl = async (url: string) => {
      try {
        const callback = new URL(url);
        const code = callback.searchParams.get("code");
        if (code && callback.protocol === "mw.wealthgrid.mas:") {
          setAuthLoading(true);
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) showNotice(error.message);
          else showNotice("You are signed in to MAS.");
          setAuthLoading(false);
        }
      } catch (error) {
        setAuthLoading(false);
        showNotice(error instanceof Error ? error.message : "Could not complete the sign-in callback.");
      }
    };
    Linking.getInitialURL().then((url) => { if (url) void handleUrl(url); });
    const urlSubscription = Linking.addEventListener("url", ({ url }) => { void handleUrl(url); });
    return () => {
      active = false;
      authListener.subscription.unsubscribe();
      urlSubscription.remove();
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!isSupabaseConfigured) { setApps([]); setCatalogueSource("unconfigured"); setPosts([]); setFeedSource("unconfigured"); return () => { active = false; }; }
    setCatalogueLoading(true);
    Promise.resolve(supabase
      .from("listings")
      .select("id,developer_id,slug,name,tagline,description,category,kind,icon_url,downloads,rating_avg,rating_count,created_at")
      .eq("status", "published")
      .not("developer_id", "in", `(${SEEDED_DEMO_DEVELOPER_IDS.join(",")})`)
      .order("created_at", { ascending: false })
      .limit(100))
      .then(async ({ data, error }) => {
        if (!active) return;
        if (!error) {
          type CatalogueListing = Pick<Listing, "id" | "developer_id" | "slug" | "name" | "tagline" | "description" | "category" | "kind" | "icon_url" | "downloads" | "rating_avg" | "rating_count" | "created_at">;
          const listingRows = (data ?? []) as CatalogueListing[];
          const developerIds = [...new Set(listingRows.map((item: any) => item.developer_id).filter(Boolean))];
          const profileResult = developerIds.length
            ? await supabase.from("public_profiles").select("id,developer_name,display_name").in("id", developerIds)
            : { data: [] as any[] };
          const profiles = new Map((profileResult.data ?? []).map((profile: any) => [
            profile.id, profile.developer_name || profile.display_name || "MAS developer",
          ]));
          const catalogue = await Promise.all(listingRows.map(async (item) => {
            const iconResult = item.icon_url
              ? await supabase.storage.from("app-assets").createSignedUrl(item.icon_url, 3600)
              : null;
            return {
              id: item.id,
              name: item.name,
              category: item.category || "Other",
              tagline: item.tagline || item.category || "Discover this project on MAS.",
              description: item.description || item.tagline || "Discover this project on MAS.",
              mark: String(item.name || "M").slice(0, 1).toUpperCase(),
              color: accentColor,
              slug: item.slug,
              kind: item.kind,
              developer: String(profiles.get(item.developer_id) || "MAS developer"),
              iconUrl: iconResult?.data?.signedUrl ?? null,
              createdAt: item.created_at,
              downloads: item.downloads ?? 0,
              rating: item.rating_avg ?? 0,
              ratingCount: item.rating_count ?? 0,
            } satisfies StoreApp;
          }));
          if (!active) return;
          setCatalogueSource("live");
          setApps(catalogue);
        }
        if (error) { setApps([]); setCatalogueSource("error"); showNotice(error.message || "Could not load the MAS catalogue."); }
        setCatalogueLoading(false);
      })
      .catch(() => { if (active) { setApps([]); setCatalogueSource("error"); setCatalogueLoading(false); showNotice("Could not load the MAS catalogue. Check your connection and try again."); } });
    setFeedLoading(true);
    Promise.resolve(
      supabase
      .from("social_posts")
      .select("id,author_id,body,created_at,media_url,media_type")
      .order("created_at", { ascending: false })
      .limit(30),
    ).then(async ({ data, error }) => {
        if (!active) return;
        if (!error) {
          const postRows = data ?? [];
          setFeedSource("live");
          if (!postRows.length) { setPosts([]); setReactionCounts({}); setLikedPostIds([]); setFeedLoading(false); return; }
          const ids = [...new Set(postRows.map((post: any) => post.author_id))];
          const { data: profiles } = await supabase
            .from("public_profiles")
            .select("id,display_name,developer_name")
            .in("id", ids);
          const names = new Map((profiles ?? []).map((profile: any) => [profile.id, profile.developer_name || profile.display_name || "MAS member"]));
          if (active) setFeedSource("live");
          if (active) setPosts(postRows.map((post: any) => ({
            id: post.id,
            authorId: post.author_id,
            name: String(names.get(post.author_id) || "MAS member"),
            tag: new Date(post.created_at).toLocaleDateString(),
            text: post.body,
            createdAt: post.created_at,
            mediaUrl: post.media_url ?? null,
            mediaType: post.media_type ?? null,
          })));
          const { data: reactionRows } = await supabase.from("social_post_reactions").select("post_id,user_id").in("post_id", postRows.map((post: any) => post.id));
          if (active && reactionRows) {
            const counts: Record<string, number> = {};
            reactionRows.forEach((reaction: any) => { counts[reaction.post_id] = (counts[reaction.post_id] ?? 0) + 1; });
            setReactionCounts(counts);
            const { data: currentUser } = await supabase.auth.getUser();
            if (currentUser.user) setLikedPostIds(reactionRows.filter((reaction: any) => reaction.user_id === currentUser.user?.id).map((reaction: any) => reaction.post_id));
          }
        } else { setFeedSource("error"); setPosts([]); showNotice(error.message || "Could not load MAS Social."); }
        if (active) setFeedLoading(false);
      })
      .catch(() => { if (active) { setPosts([]); setFeedSource("error"); setFeedLoading(false); showNotice("Could not load MAS Social. Check your connection and try again."); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (utilityScreen !== "settings") return;
    let active = true;
    const loadAccountSettings = async () => {
      if (!isSupabaseConfigured) { setUtilityLoading(false); return; }
      setUtilityLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      if (!active) return;
      if (!authData.user) { setUtilityLoading(false); return; }
      const { data, error } = await supabase.from("profiles").select("display_name,developer_name,bio,avatar_url,company_name,location,contact_email,skills,website_url,github_url,portfolio_url,linkedin_url,facebook_url").eq("id", authData.user.id).maybeSingle();
      if (!active) return;
      setAccountDisplayName(data?.display_name || "");
      setAccountDeveloperName(data?.developer_name || "");
      setAccountBio(data?.bio || "");
      setAccountCompanyName(data?.company_name || "");
      setAccountLocation(data?.location || "");
      setAccountContactEmail(data?.contact_email || "");
      setAccountSkills(Array.isArray(data?.skills) ? data.skills.join(", ") : "");
      setAccountWebsiteUrl(data?.website_url || "");
      setAccountGithubUrl(data?.github_url || "");
      setAccountPortfolioUrl(data?.portfolio_url || "");
      setAccountLinkedinUrl(data?.linkedin_url || "");
      setAccountFacebookUrl(data?.facebook_url || "");
      if (data?.avatar_url) {
        const { data: avatarData } = await supabase.storage.from("app-assets").createSignedUrl(data.avatar_url, 3600);
        if (active) setAccountAvatarUri(avatarData?.signedUrl ?? null);
      } else {
        setAccountAvatarUri(null);
      }
      if (error) showNotice(error.message || "Could not load account settings.");
      setUtilityLoading(false);
    };
    void loadAccountSettings().catch(() => { if (active) { setUtilityLoading(false); showNotice("Could not load account settings."); } });
    return () => { active = false; };
  }, [utilityScreen]);

  useEffect(() => {
    if (tab !== "Profile" || !userEmail || !isSupabaseConfigured) return;
    let active = true;
    const loadProfileSummary = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!active || !authData.user) return;
      const { data } = await supabase.from("profiles").select("display_name,developer_name,avatar_url").eq("id", authData.user.id).maybeSingle();
      if (!active || !data) return;
      setAccountDisplayName(data.display_name || "");
      setAccountDeveloperName(data.developer_name || "");
      if (data.avatar_url) {
        const { data: avatarData } = await supabase.storage.from("app-assets").createSignedUrl(data.avatar_url, 3600);
        if (active) setAccountAvatarUri(avatarData?.signedUrl ?? null);
      } else {
        setAccountAvatarUri(null);
      }
    };
    void loadProfileSummary().catch(() => undefined);
    return () => { active = false; };
  }, [tab, userEmail]);

  useEffect(() => {
    let active = true;
    const loadUtilityData = async () => {
      if (utilityScreen !== "library" && utilityScreen !== "notifications") return;
      if (!isSupabaseConfigured) { setUtilityLoading(false); return; }
      setUtilityLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      if (!active) return;
      if (!authData.user) { setUtilityLoading(false); return; }
      if (utilityScreen === "library") {
        const [savedResult, installedResult] = await Promise.all([
          supabase.from("wishlist").select("listing_id,created_at,listings(id,name,category,description,slug,kind)").eq("user_id", authData.user.id).order("created_at", { ascending: false }),
          supabase.from("installed_apps").select("id,installed_at,listings(id,name,category,description,slug,kind)").eq("user_id", authData.user.id).order("installed_at", { ascending: false }),
        ]);
        if (active) {
          setLibraryData({ saved: savedResult.data ?? [], installed: installedResult.data ?? [] });
          if (savedResult.error || installedResult.error) showNotice("Some library items could not be loaded.");
          setUtilityLoading(false);
        }
      } else {
        const { data, error } = await supabase.from("notifications").select("id,title,body,read,created_at").eq("user_id", authData.user.id).order("created_at", { ascending: false }).limit(50);
        if (active) {
          setNotificationItems(data ?? []);
          if (error) showNotice("Notifications could not be loaded.");
          setUtilityLoading(false);
        }
      }
    };
    void loadUtilityData().catch(() => { if (active) { setUtilityLoading(false); showNotice("Could not load this section. Check your connection and retry."); } });
    return () => { active = false; };
  }, [utilityScreen]);

  useEffect(() => {
    let active = true;
    const loadListingDetails = async () => {
      if (!selectedApp || !isSupabaseConfigured) {
        setSelectedAppDetails(null); setSelectedVersions([]); setSelectedReviews([]); setSelectedScreenshotUrls([]); setDetailLoading(false); return;
      }
      setDetailLoading(true);
      const [listingResult, versionsResult, reviewsResult] = await Promise.all([
        supabase.from("listings").select("id,slug,name,tagline,description,kind,website_url,price_mwk,monetization,price_month_mwk,price_year_mwk,screenshots,video_url").eq("id", selectedApp.id).maybeSingle(),
        supabase.from("listing_versions").select("id,version,release_notes,changelog,file_url,size_bytes,status,created_at").eq("listing_id", selectedApp.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("reviews").select("id,user_id,rating,body,created_at").eq("listing_id", selectedApp.id).order("created_at", { ascending: false }).limit(30),
      ]);
      const screenshotPaths: string[] = Array.isArray(listingResult.data?.screenshots) ? listingResult.data.screenshots : [];
      const signedScreenshotResults = await Promise.all(screenshotPaths.slice(0, 8).map((path: string) => supabase.storage.from("app-assets").createSignedUrl(path, 3600)));
      if (!active) return;
      setSelectedScreenshotUrls(signedScreenshotResults.map((result: any) => result.data?.signedUrl).filter(Boolean));
      setSelectedAppDetails(listingResult.data ?? null);
      setSelectedVersions(versionsResult.data ?? []);
      setSelectedReviews(reviewsResult.data ?? []);
      if (listingResult.error || versionsResult.error || reviewsResult.error) showNotice("Some listing details could not be loaded.");
      setDetailLoading(false);
    };
    void loadListingDetails().catch(() => { if (active) { setDetailLoading(false); showNotice("Could not load listing details. Check your connection and retry."); } });
    return () => { active = false; };
  }, [selectedApp]);

  const saveAccountProfile = async () => {
    if (!isSupabaseConfigured) { showNotice("Account settings need the MAS backend configuration."); return; }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in to update your profile."); setUtilityScreen("none"); setTab("Profile"); return; }
    const displayName = accountDisplayName.trim();
    const developerName = accountDeveloperName.trim();
    const bio = accountBio.trim();
    const profileUrls = [
      ["Website", accountWebsiteUrl], ["GitHub", accountGithubUrl], ["Portfolio", accountPortfolioUrl],
      ["LinkedIn", accountLinkedinUrl], ["Facebook", accountFacebookUrl],
    ] as [string, string][];
    for (const [label, value] of profileUrls) {
      if (value.trim() && !/^https:\/\//i.test(value.trim())) {
        showNotice(`${label} URL must start with https://.`);
        return;
      }
    }
    if (accountContactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountContactEmail.trim())) {
      showNotice("Enter a valid contact email address.");
      return;
    }
    if (displayName.length > 80 || developerName.length > 100 || bio.length > 300) { showNotice("Display name: max 80 characters; developer name: max 100; bio: max 300."); return; }
    setAccountProfileSaving(true);
    const { error } = await supabase.from("profiles").update({
      display_name: displayName || null,
      developer_name: developerName || null,
      bio: bio || null,
      company_name: accountCompanyName.trim() || null,
      location: accountLocation.trim() || null,
      contact_email: accountContactEmail.trim() || null,
      skills: accountSkills.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 30),
      website_url: accountWebsiteUrl.trim() || null,
      github_url: accountGithubUrl.trim() || null,
      portfolio_url: accountPortfolioUrl.trim() || null,
      linkedin_url: accountLinkedinUrl.trim() || null,
      facebook_url: accountFacebookUrl.trim() || null,
    }).eq("id", authData.user.id);
    setAccountProfileSaving(false);
    if (error) { showNotice(error.message || "Could not save your profile."); return; }
    showNotice("Profile saved.");
  };

  const chooseAccountAvatar = async () => {
    if (!isSupabaseConfigured) { showNotice("Profile photo upload needs the MAS backend configuration."); return; }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { showNotice("Allow photo access to choose a profile picture."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in to update your profile photo."); return; }
    try {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const path = `${authData.user.id}/avatars/${Date.now()}-${(asset.fileName || "avatar.jpg").replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: uploadError } = await supabase.storage.from("app-assets").upload(path, blob, { contentType: asset.mimeType || "image/jpeg", upsert: false });
      if (uploadError) throw uploadError;
      const { error: profileError } = await supabase.from("profiles").update({ avatar_url: path }).eq("id", authData.user.id);
      if (profileError) throw profileError;
      const { data: signedAvatar } = await supabase.storage.from("app-assets").createSignedUrl(path, 3600);
      setAccountAvatarUri(signedAvatar?.signedUrl ?? null);
      showNotice("Profile photo updated.");
    } catch (error: any) {
      showNotice(error?.message || "Could not upload the profile photo.");
    }
  };

  const installSelectedApp = async () => {
    if (!selectedApp) { showNotice("Choose a live MAS listing first."); return; }
    if (!isSupabaseConfigured) { showNotice("Install actions need the MAS backend configuration."); return; }
    const { data: authData } = await supabase.auth.getUser();
    const listing = selectedAppDetails;
    const latest = selectedVersions.find((version) => version.status === "published") ?? selectedVersions[0];
    if (listing?.kind === "website" && listing.website_url) {
      const { error } = await supabase.rpc("register_install", { _listing_id: selectedApp.id, _device: "Android" });
      if (error) { showNotice(error.message || "Could not record this visit."); return; }
      await Linking.openURL(listing.website_url).catch(() => showNotice("Could not open this website."));
      return;
    }
    if (!latest?.file_url) { showNotice("This app does not have a downloadable release yet."); return; }
    const { error: eventError } = await supabase.rpc("register_install", { _listing_id: selectedApp.id, _device: "Android" });
    if (eventError) { showNotice(eventError.message || "Could not record this install."); return; }
    if (authData.user) {
      const { error } = await supabase.from("installed_apps").upsert({ user_id: authData.user.id, listing_id: selectedApp.id, installed_version_id: latest.id }, { onConflict: "user_id,listing_id" });
      if (error) { showNotice(error.message || "Could not update your library."); return; }
    }
    const { data: signed, error } = await supabase.storage.from("app-assets").createSignedUrl(latest.file_url, 3600);
    if (error || !signed?.signedUrl) { showNotice("Could not create a secure download link."); return; }
    showNotice("Opening the app download.");
    await Linking.openURL(signed.signedUrl).catch(() => showNotice("Could not open the download link."));
  };

  const submitSelectedReview = async () => {
    if (!selectedApp) { showNotice("Choose a live MAS listing first."); return; }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in to post a review."); setSelectedApp(null); setTab("Profile"); return; }
    const { error } = await supabase.from("reviews").upsert({ listing_id: selectedApp.id, user_id: authData.user.id, rating: reviewRating, body: reviewDraft.trim() || null }, { onConflict: "listing_id,user_id" });
    if (error) { showNotice(error.message || "Could not save your review."); return; }
    setReviewDraft("");
    const { data } = await supabase.from("reviews").select("id,user_id,rating,body,created_at").eq("listing_id", selectedApp.id).order("created_at", { ascending: false }).limit(30);
    setSelectedReviews(data ?? []);
    showNotice("Your review has been saved.");
  };

  useEffect(() => {
    let active = true;
    const loadDeveloperListings = async () => {
      if (!developerScreen || !["Developer dashboard", "My applications", "Analytics", "Reviews", "Publishing checklist", "Quality checks", "My public profile", "Spotlight", "Testing"].includes(developerScreen)) return;
      if (!isSupabaseConfigured) { setDeveloperRows([]); setDeveloperLoading(false); return; }
      setDeveloperLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      if (!active) return;
      if (!authData.user) { setDeveloperRows([]); setDeveloperLoading(false); showNotice("Sign in to access developer tools."); return; }
      if (developerScreen === "My public profile") {
        const { data: profileData, error: profileError } = await supabase.from("profiles").select("display_name,developer_name,bio,avatar_url,website_url,linkedin_url,facebook_url").eq("id", authData.user.id).maybeSingle();
        if (!active) return;
        setDeveloperProfileInfo(profileData ?? null);
        setPortfolioLoading(true);
        const { data: portfolioData, error: portfolioError } = await supabase.from("developer_portfolio_projects")
          .select("id,title,description,project_type,url,created_at")
          .eq("developer_id", authData.user.id).order("created_at", { ascending: false }).limit(100);
        if (!active) return;
        setPortfolioProjects(portfolioData ?? []);
        setPortfolioLoading(false);
        if (portfolioError) showNotice(portfolioError.message || "Could not load portfolio projects.");
        if (profileError) showNotice(profileError.message || "Could not load your public profile.");
      }
      const { data, error } = await supabase.from("listings").select("id,name,slug,kind,category,tagline,description,website_url,icon_url,banner_url,screenshots,keywords,tags,status,downloads,rating_avg,rating_count,created_at").eq("developer_id", authData.user.id).order("created_at", { ascending: false }).limit(100);
      if (!active) return;
      setDeveloperRows(data ?? []);
      if (developerScreen === "Reviews" && data?.length) {
        const { data: reviewData, error: reviewError } = await supabase.from("reviews")
          .select("id,listing_id,rating,body,created_at,developer_reply,replied_at")
          .in("listing_id", data.map((item: any) => item.id))
          .order("created_at", { ascending: false })
          .limit(100);
        if (!active) return;
        setDeveloperReviews(reviewData ?? []);
        if (reviewError) showNotice(reviewError.message || "Could not load product reviews.");
      } else if (developerScreen === "Reviews") {
        setDeveloperReviews([]);
      }
      setDeveloperLoading(false);
      if (error) showNotice(error.message || "Could not load developer listings.");
    };
    void loadDeveloperListings().catch(() => { if (active) { setDeveloperLoading(false); showNotice("Could not load developer data."); } });
    return () => { active = false; };
  }, [developerScreen]);

  const startEditingListing = (listing: any) => {
    if (listing.status === "pending") {
      showNotice("A listing awaiting review cannot be edited.");
      return;
    }
    setEditingListingId(listing.id);
    setEditingListingStatus(listing.status);
    setDraftName(listing.name || "");
    setDraftTagline(listing.tagline || "");
    setDraftDescription(listing.description || "");
    setDraftCategory(listing.category || "Tools");
    setDraftKind(listing.kind === "website" ? "website" : "app");
    setDraftWebsiteUrl(listing.website_url || "");
    setDraftIcon(null);
    setDraftBanner(null);
    setExistingBannerUrl(listing.banner_url || null);
    setDraftReleaseFile(null);
    setDraftVersion("1.0.0");
    setDraftChangelog("First release");
    setDraftScreenshots([]);
    setExistingScreenshots(Array.isArray(listing.screenshots) ? listing.screenshots : []);
    setDraftKeywords(Array.isArray(listing.keywords) ? listing.keywords.join(", ") : "");
    setDraftTags(Array.isArray(listing.tags) ? listing.tags.join(", ") : "");
    setDeveloperScreen("Publish a product");
    showNotice("Draft loaded for editing.");
  };

  const submitDraftForReview = async (listing: any) => {
    if (!isSupabaseConfigured) { showNotice("Submitting a listing needs the MAS backend configuration."); return; }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in to submit a product for review."); setDeveloperScreen(null); setTab("Profile"); return; }
    const { data: current, error: listingError } = await supabase.from("listings")
      .select("id,name,kind,description,tagline,website_url,icon_url,status")
      .eq("id", listing.id).eq("developer_id", authData.user.id).maybeSingle();
    if (listingError || !current) { showNotice(listingError?.message || "This listing could not be found."); return; }
    if (current.status !== "draft" && current.status !== "rejected") { showNotice("Only draft or rejected listings can be submitted."); return; }
    if ((current.name || "").trim().length < 3 || (current.description || "").trim().length < 20) { showNotice("Add a product name and a description of at least 20 characters before submitting."); return; }
    if (!current.icon_url) { showNotice("Upload a product icon before submitting for review."); return; }
    if (current.kind === "website") {
      if (!/^https:\/\//i.test(current.website_url || "")) { showNotice("Add a valid HTTPS website URL before submitting."); return; }
    } else {
      const { data: versions, error: versionError } = await supabase.from("listing_versions").select("id,file_url").eq("listing_id", listing.id).order("created_at", { ascending: false }).limit(10);
      if (versionError) { showNotice(versionError.message || "Could not verify the release file."); return; }
      if (!(versions || []).some((version: any) => Boolean(version.file_url))) { showNotice("Upload an APK or ZIP release before submitting this app."); return; }
    }
    const { data: checkResult, error: checkError } = await supabase.rpc("attempt_auto_publish", { _listing_id: listing.id });
    if (checkError) {
      showNotice(checkError.message || "Publishing checks could not run. No status was changed.");
      return;
    }
    const result = checkResult as { ok?: boolean; status?: string; auto_published?: boolean; review_required?: boolean; reasons?: string[]; message?: string } | null;
    if (!result) {
      showNotice("The publishing service returned no result. No status was changed.");
      return;
    }
    if (result.status) {
      setDeveloperRows((rows) => rows.map((row) => row.id === listing.id ? { ...row, status: result.status } : row));
    }
    if (!result.ok && result.reasons?.length) {
      showNotice((result.message || "Fix these listing issues:") + " " + result.reasons.join(" "));
      return;
    }
    showNotice(result.message || (result.auto_published ? "Website listing published." : result.review_required ? "Checks passed. Your app is awaiting security review." : "Publishing checks completed."));
  };

  const deleteNativeDraft = async (listing: any) => {
    if (listing.status !== "draft") {
      showNotice("Only unpublished drafts can be deleted from the native app.");
      return;
    }
    if (!isSupabaseConfigured) {
      showNotice("Draft management needs the MAS backend configuration.");
      return;
    }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      showNotice("Sign in to manage product drafts.");
      setDeveloperScreen(null);
      setTab("Profile");
      return;
    }
    const { error } = await supabase.from("listings")
      .delete()
      .eq("id", listing.id)
      .eq("developer_id", authData.user.id)
      .eq("status", "draft");
    if (error) {
      showNotice(error.message || "Could not delete this draft.");
      return;
    }
    setDeveloperRows((rows) => rows.filter((row) => row.id !== listing.id));
    if (editingListingId === listing.id) {
      setEditingListingId(null);
      setDraftName("");
      setDraftTagline("");
      setDraftDescription("");
      setDraftWebsiteUrl("");
    }
    showNotice("Product draft deleted.");
  };

  const replyToDeveloperReview = async (review: any) => {
    const reply = (reviewReplies[review.id] || "").trim();
    if (!reply) { showNotice("Write a reply before publishing it."); return; }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in to reply to reviews."); return; }
    setReviewReplySaving(review.id);
    const { error } = await supabase.from("reviews").update({ developer_reply: reply, replied_at: new Date().toISOString() }).eq("id", review.id);
    setReviewReplySaving(null);
    if (error) { showNotice(error.message || "Could not publish the review reply."); return; }
    setDeveloperReviews((items) => items.map((item) => item.id === review.id ? { ...item, developer_reply: reply, replied_at: new Date().toISOString() } : item));
    setReviewReplies((items) => ({ ...items, [review.id]: "" }));
    showNotice("Reply published.");
  };

  const createNativeDraft = async () => {
    const name = draftName.trim();
    const description = draftDescription.trim();
    if (name.length < 3) { showNotice("Product name must contain at least 3 characters."); return; }
    if (description.length < 20) { showNotice("Description must contain at least 20 characters."); return; }
    if (draftKind === "website" && !/^https:\/\//i.test(draftWebsiteUrl.trim())) { showNotice("Enter a valid HTTPS website URL."); return; }
    if (!isSupabaseConfigured) { showNotice("Draft creation needs the MAS backend configuration."); return; }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in to create a product draft."); setDeveloperScreen(null); setTab("Profile"); return; }
    setDraftSaving(true);
    const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "listing";
    const payload: Record<string, any> = {
      name,
      slug,
      kind: draftKind,
      category: draftCategory,
      tagline: draftTagline.trim() || null,
      description,
      website_url: draftKind === "website" ? draftWebsiteUrl.trim() : null,
      screenshots: existingScreenshots,
      keywords: draftKeywords.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12),
      tags: draftTags.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 8),
    };
    if (draftIcon) {
      try {
        const response = await fetch(draftIcon.uri);
        const blob = await response.blob();
        const extension = (draftIcon.fileName.split(".").pop() || "jpg").toLowerCase();
        const iconPath = `${authData.user.id}/icons/${Date.now()}.${extension.replace(/[^a-z0-9]/g, "") || "jpg"}`;
        const { error: iconError } = await supabase.storage.from("app-assets").upload(iconPath, blob, { contentType: draftIcon.mimeType, upsert: false });
        if (iconError) throw iconError;
        payload.icon_url = iconPath;
      } catch (iconError: any) {
        setDraftSaving(false);
        showNotice(iconError?.message || "Could not upload the product icon.");
        return;
      }
    }
    if (draftBanner) {
      try {
        const response = await fetch(draftBanner.uri);
        const blob = await response.blob();
        const extension = (draftBanner.fileName.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const path = `${authData.user.id}/banners/${Date.now()}.${extension}`;
        const { error: bannerError } = await supabase.storage.from("app-assets").upload(path, blob, { contentType: draftBanner.mimeType, upsert: false });
        if (bannerError) throw bannerError;
        payload.banner_url = path;
      } catch (bannerError: any) {
        setDraftSaving(false);
        showNotice(bannerError?.message || "Could not upload the feature banner.");
        return;
      }
    }
    if (draftScreenshots.length) {
      try {
        const uploadedPaths: string[] = [];
        for (const screenshot of draftScreenshots) {
          const response = await fetch(screenshot.uri);
          const blob = await response.blob();
          const extension = (screenshot.fileName.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
          const path = `${authData.user.id}/screenshots/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
          const { error: screenshotError } = await supabase.storage.from("app-assets").upload(path, blob, { contentType: screenshot.mimeType, upsert: false });
          if (screenshotError) throw screenshotError;
          uploadedPaths.push(path);
        }
        payload.screenshots = [...existingScreenshots, ...uploadedPaths].slice(0, 8);
      } catch (screenshotError: any) {
        setDraftSaving(false);
        showNotice(screenshotError?.message || "Could not upload listing screenshots.");
        return;
      }
    }
    const result = editingListingId
      ? await supabase.from("listings").update(payload)
           .eq("id", editingListingId)
          .eq("developer_id", authData.user.id)
          .eq("status", editingListingStatus || "draft")
          .select("id,name,slug,kind,category,tagline,description,website_url,icon_url,banner_url,screenshots,keywords,tags,status,downloads,rating_avg,rating_count,created_at").maybeSingle()
      : await supabase.from("listings").insert({
          ...payload,
          developer_id: authData.user.id,
          status: "draft",
        }).select("id,name,slug,kind,category,tagline,description,website_url,icon_url,banner_url,screenshots,keywords,tags,status,downloads,rating_avg,rating_count,created_at").single();
    setDraftSaving(false);
    if (result.error || !result.data) {
      showNotice(result.error?.message || "The draft was not updated. It may no longer be editable.");
      return;
    }
    setDeveloperRows((rows) => editingListingId
      ? rows.map((row) => row.id === editingListingId ? { ...row, ...result.data } : row)
      : [result.data, ...rows]);
    const wasEditing = Boolean(editingListingId);
    if (draftKind === "app" && draftReleaseFile) {
      try {
        const response = await fetch(draftReleaseFile.uri);
        const blob = await response.blob();
        const extension = (draftReleaseFile.name.split(".").pop() || "apk").toLowerCase();
        const releasePath = `${authData.user.id}/builds/${Date.now()}-${draftReleaseFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: uploadError } = await supabase.storage.from("app-assets").upload(releasePath, blob, { contentType: draftReleaseFile.mimeType, upsert: false });
        if (uploadError) throw uploadError;
        const { error: versionError } = await supabase.from("listing_versions").insert({ listing_id: result.data.id, version: draftVersion.trim() || "1.0.0", changelog: draftChangelog.trim() || "Release upload", file_url: releasePath, size_bytes: draftReleaseFile.size });
        if (versionError) throw versionError;
        setDraftReleaseFile(null);
      } catch (releaseError: any) {
        setDeveloperRows((rows) => editingListingId ? rows.map((row) => row.id === editingListingId ? { ...row, ...result.data } : row) : [result.data, ...rows]);
        setEditingListingId(result.data.id);
        setDraftSaving(false);
        showNotice(releaseError?.message || "The draft was saved, but the release file could not be uploaded. Retry the release upload.");
        return;
      }
    }
    setEditingListingId(null);
    setEditingListingStatus(null);
    setDraftName(""); setDraftTagline(""); setDraftDescription(""); setDraftWebsiteUrl(""); setDraftIcon(null); setDraftBanner(null); setExistingBannerUrl(null); setDraftReleaseFile(null); setDraftVersion("1.0.0"); setDraftChangelog("First release"); setDraftScreenshots([]); setExistingScreenshots([]); setDraftKeywords(""); setDraftTags("");
    showNotice(wasEditing ? "Product draft updated." : "Product draft saved. Complete the checklist before submitting for review.");
    setDeveloperScreen("My applications");
  };

  const chooseDraftBanner = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { showNotice("Allow photo access to choose a feature banner."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [16, 9], quality: 0.85 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setDraftBanner({ uri: asset.uri, fileName: asset.fileName || `banner-${Date.now()}.jpg`, mimeType: asset.mimeType || "image/jpeg" });
  };

  const chooseDraftScreenshots = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { showNotice("Allow photo access to choose listing screenshots."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 5, quality: 0.85 });
    if (result.canceled || !result.assets?.length) return;
    const selected = result.assets.map((asset) => ({ uri: asset.uri, fileName: asset.fileName || `screenshot-${Date.now()}.jpg`, mimeType: asset.mimeType || "image/jpeg" }));
    setDraftScreenshots((current) => [...current, ...selected].slice(0, Math.max(0, 8 - existingScreenshots.length)));
  };

  const chooseDraftReleaseFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/vnd.android.package-archive", "application/zip", "application/octet-stream"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const extension = (asset.name.split(".").pop() || "").toLowerCase();
    if (!["apk", "zip"].includes(extension)) {
      showNotice("Choose an Android APK or ZIP release file.");
      return;
    }
    setDraftReleaseFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType || (extension === "apk" ? "application/vnd.android.package-archive" : "application/zip"), size: asset.size ?? null });
  };

  const chooseDraftIcon = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { showNotice("Allow photo access to choose a product icon."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setDraftIcon({ uri: asset.uri, fileName: asset.fileName || `icon-${Date.now()}.jpg`, mimeType: asset.mimeType || "image/jpeg" });
  };

  const choosePostMedia = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { showNotice("Allow photo and video access to attach media."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsEditing: false,
      quality: 0.85,
      videoMaxDuration: 90,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const type = asset.type === "video" ? "video" : "image";
    const extension = (asset.fileName?.split(".").pop() || (type === "video" ? "mp4" : "jpg")).toLowerCase();
    setSelectedMedia({
      uri: asset.uri,
      type,
      fileName: asset.fileName || `upload.${extension}`,
      mimeType: asset.mimeType || (type === "video" ? "video/mp4" : "image/jpeg"),
    });
  };

  const uploadPostMedia = async (userId: string) => {
    if (!selectedMedia) return null;
    const response = await fetch(selectedMedia.uri);
    const blob = await response.blob();
    const path = `${userId}/${Date.now()}-${selectedMedia.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await supabase.storage.from("social-media").upload(path, blob, {
      contentType: selectedMedia.mimeType,
      upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from("social-media").getPublicUrl(path);
    return { url: data.publicUrl, type: selectedMedia.type };
  };

  const loadConversationPreviews = async () => {
    if (!isSupabaseConfigured) { setConversationPreviews([]); return; }
    setConversationLoading(true);
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      setConversationPreviews([]);
      setConversationLoading(false);
      return;
    }
    const userId = authData.user.id;
    const { data, error } = await supabase.from("social_messages")
      .select("id,sender_id,recipient_id,body,created_at,read_at")
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) {
      setConversationLoading(false);
      showNotice(error.message || "Could not load your conversations.");
      return;
    }
    const grouped = new Map<string, { userId: string; name: string; body: string; createdAt: string; unread: number }>();
    (data ?? []).forEach((message: any) => {
      const partnerId = message.sender_id === userId ? message.recipient_id : message.sender_id;
      if (!partnerId || partnerId === userId) return;
      const current = grouped.get(partnerId);
      if (!current) {
        grouped.set(partnerId, {
          userId: partnerId,
          name: "MAS member",
          body: message.body || "",
          createdAt: message.created_at,
          unread: message.recipient_id === userId && !message.read_at ? 1 : 0,
        });
      } else if (message.recipient_id === userId && !message.read_at) {
        current.unread += 1;
      }
    });
    const partnerIds = [...grouped.keys()];
    if (partnerIds.length) {
      const { data: profiles } = await supabase.from("public_profiles")
        .select("id,display_name,developer_name")
        .in("id", partnerIds);
      const names = new Map((profiles ?? []).map((profile: any) => [
        profile.id, profile.developer_name || profile.display_name || "MAS member",
      ]));
      grouped.forEach((preview, id) => { preview.name = String(names.get(id) || "MAS member"); });
    }
    setConversationPreviews([...grouped.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    setConversationLoading(false);
  };

  useEffect(() => {
    if (tab === "Social" && socialSection === "Messages" && !activeConversationUserId) {
      void loadConversationPreviews();
    }
  }, [tab, socialSection, activeConversationUserId]);

  useEffect(() => {
    if (tab !== "Social" || !["Connections", "Activity", "Investors"].includes(socialSection)) return;
    let active = true;
    const loadSection = async () => {
      if (!isSupabaseConfigured) {
        setSocialConnections([]);
        setSocialNotifications([]);
        setInvestmentOpportunities([]);
        setSocialConnectionsLoading(false);
        setSocialNotificationsLoading(false);
        setInvestmentLoading(false);
        return;
      }
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !authData.user) {
        setSocialConnections([]);
        setSocialNotifications([]);
        setInvestmentOpportunities([]);
        setSocialConnectionsLoading(false);
        setSocialNotificationsLoading(false);
        setInvestmentLoading(false);
        return;
      }
      const userId = authData.user.id;
      if (socialSection === "Connections") {
        setSocialConnectionsLoading(true);
        const { data, error } = await supabase.from("social_connections")
          .select("id,requester_id,recipient_id,status,created_at")
          .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
          .order("created_at", { ascending: false }).limit(200);
        if (!active) return;
        if (error) {
          setSocialConnectionsLoading(false);
          showNotice(error.message || "Could not load connection requests.");
          return;
        }
        const ids = [...new Set((data ?? []).flatMap((item: any) => [item.requester_id, item.recipient_id]).filter((id: string) => id !== userId))];
        const { data: profiles } = ids.length
          ? await supabase.from("public_profiles").select("id,display_name,developer_name").in("id", ids)
          : { data: [] as any[] };
        if (!active) return;
        const names = new Map((profiles ?? []).map((profile: any) => [profile.id, profile.developer_name || profile.display_name || "MAS member"]));
        setSocialConnections((data ?? []).map((item: any) => ({
          ...item,
          direction: item.requester_id === userId ? "outgoing" : "incoming",
          otherUserId: item.requester_id === userId ? item.recipient_id : item.requester_id,
          otherName: String(names.get(item.requester_id === userId ? item.recipient_id : item.requester_id) || "MAS member"),
        })));
        setSocialConnectionsLoading(false);
      } else if (socialSection === "Activity") {
        setSocialNotificationsLoading(true);
        const { data, error } = await supabase.from("social_notifications")
          .select("id,title,body,read,created_at")
          .eq("user_id", userId).order("created_at", { ascending: false }).limit(100);
        if (!active) return;
        setSocialNotifications(data ?? []);
        setSocialNotificationsLoading(false);
        if (error) showNotice(error.message || "Could not load Social activity.");
      } else if (socialSection === "Investors") {
        setInvestmentLoading(true);
        const { data, error } = await supabase.from("social_investment_opportunities")
          .select("id,founder_id,title,description,industry,stage,funding_goal,currency,use_of_funds,status,created_at")
          .or(`status.eq.open,founder_id.eq.${userId}`)
          .order("created_at", { ascending: false }).limit(100);
        if (!active) return;
        if (error) {
          setInvestmentOpportunities([]);
          setInvestmentLoading(false);
          showNotice(error.message || "Could not load investment opportunities.");
          return;
        }
        const ids = [...new Set((data ?? []).map((item: any) => item.founder_id))];
        const { data: profiles } = ids.length
          ? await supabase.from("public_profiles").select("id,display_name,developer_name").in("id", ids)
          : { data: [] as any[] };
        if (!active) return;
        const names = new Map((profiles ?? []).map((profile: any) => [profile.id, profile.developer_name || profile.display_name || "MAS founder"]));
        setInvestmentOpportunities((data ?? []).map((item: any) => ({
          ...item,
          founderName: String(names.get(item.founder_id) || "MAS founder"),
          isOwner: item.founder_id === userId,
        })));
        setInvestmentLoading(false);
      }
    };
    void loadSection().catch(() => {
      if (!active) return;
      setSocialConnectionsLoading(false);
      setSocialNotificationsLoading(false);
      setInvestmentLoading(false);
      showNotice("Could not load this Social section. Check your connection and try again.");
    });
    return () => { active = false; };
  }, [tab, socialSection]);

  useEffect(() => {
    if (!isSupabaseConfigured || !developerScreen || !["Team management", "Spotlight", "Testing"].includes(developerScreen)) return;
    let active = true;
    const loadDeveloperWorkspace = async () => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !authData.user) {
        setTeamMembers([]);
        setTeamActivity([]);
        setSpotlightApplications([]);
        setTeamLoading(false);
        setSpotlightLoading(false);
        return;
      }
      const userId = authData.user.id;
      if (developerScreen === "Team management") {
        setTeamLoading(true);
        const [membersResult, activityResult] = await Promise.all([
          supabase.from("team_members").select("id,email,role,status,created_at").eq("owner_id", userId).order("created_at", { ascending: false }).limit(100),
          supabase.from("activity_logs").select("id,action,target,created_at").eq("owner_id", userId).order("created_at", { ascending: false }).limit(30),
        ]);
        if (!active) return;
        setTeamMembers(membersResult.data ?? []);
        setTeamActivity(activityResult.data ?? []);
        setTeamLoading(false);
        if (membersResult.error) showNotice(membersResult.error.message || "Could not load team members.");
        if (activityResult.error) showNotice(activityResult.error.message || "Could not load the team activity log.");
      } else if (developerScreen === "Spotlight") {
        setSpotlightLoading(true);
        const { data, error } = await supabase.from("spotlight_applications")
          .select("id,listing_id,opportunity,pitch,status,created_at")
          .eq("developer_id", userId).order("created_at", { ascending: false }).limit(100);
        if (!active) return;
        setSpotlightApplications(data ?? []);
        setSpotlightLoading(false);
        if (error) showNotice(error.message || "Could not load spotlight applications.");
      } else {
        setBetaLoading(true);
        const [testersResult, feedbackResult] = await Promise.all([
          supabase.from("beta_testers").select("id,listing_id,email,channel,status,created_at").eq("owner_id", userId).order("created_at", { ascending: false }).limit(200),
          supabase.from("beta_feedback").select("id,listing_id,kind,severity,body,status,created_at").eq("owner_id", userId).order("created_at", { ascending: false }).limit(200),
        ]);
        if (!active) return;
        setBetaTesters(testersResult.data ?? []);
        setBetaFeedback(feedbackResult.data ?? []);
        setBetaLoading(false);
        if (testersResult.error) showNotice(testersResult.error.message || "Could not load beta testers.");
        if (feedbackResult.error) showNotice(feedbackResult.error.message || "Could not load beta feedback.");
      }
    };
    void loadDeveloperWorkspace().catch(() => {
      if (!active) return;
      setTeamLoading(false);
      setSpotlightLoading(false);
      showNotice("Could not load this developer workspace. Check your connection and try again.");
    });
    return () => { active = false; };
  }, [developerScreen]);

  const writeTeamActivity = async (ownerId: string, actorId: string, action: string, target?: string) => {
    const { error } = await supabase.from("activity_logs").insert({
      owner_id: ownerId,
      actor_id: actorId,
      action,
      target: target || null,
    });
    if (error) showNotice("The team action succeeded, but its activity entry could not be recorded.");
  };

  const inviteTeamMember = async () => {
    const email = teamEmail.trim().toLowerCase();
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
      showNotice("Enter a valid teammate email address.");
      return;
    }
    if (!isSupabaseConfigured) { showNotice("Team management needs the MAS backend configuration."); return; }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in to manage your developer team."); setTab("Profile"); return; }
    if (email === (authData.user.email || "").toLowerCase()) { showNotice("You cannot invite your own account."); return; }
    setTeamSaving(true);
    const { data, error } = await supabase.from("team_members")
      .insert({ owner_id: authData.user.id, email, role: teamRole, status: "invited" })
      .select("id,email,role,status,created_at").single();
    setTeamSaving(false);
    if (error || !data) { showNotice(error?.code === "23505" ? "This email already has a team invitation." : error?.message || "Could not invite this teammate."); return; }
    setTeamMembers((items) => [data, ...items]);
    await writeTeamActivity(authData.user.id, authData.user.id, "Invited teammate as " + teamRole, email);
    setTeamEmail("");
    showNotice("Team invitation recorded. The teammate must still join through the account workflow.");
  };

  const updateTeamMember = async (member: any, patch: { role?: string; status?: string }) => {
    if (!isSupabaseConfigured) return;
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in to manage your team."); return; }
    const { data, error } = await supabase.from("team_members")
      .update(patch).eq("id", member.id).eq("owner_id", authData.user.id)
      .select("id,email,role,status,created_at").maybeSingle();
    if (error || !data) { showNotice(error?.message || "Could not update this team member."); return; }
    setTeamMembers((items) => items.map((item) => item.id === member.id ? data : item));
    await writeTeamActivity(authData.user.id, authData.user.id, "Updated teammate " + (patch.role ? "role to " + patch.role : "status to " + patch.status), member.email);
    showNotice("Team member updated.");
  };

  const removeTeamMember = async (member: any) => {
    if (!isSupabaseConfigured) return;
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in to manage your team."); return; }
    const { error } = await supabase.from("team_members").delete().eq("id", member.id).eq("owner_id", authData.user.id);
    if (error) { showNotice(error.message || "Could not remove this team member."); return; }
    setTeamMembers((items) => items.filter((item) => item.id !== member.id));
    await writeTeamActivity(authData.user.id, authData.user.id, "Removed teammate", member.email);
    showNotice("Team member removed.");
  };

  const addBetaTester = async () => {
    const email = betaTesterEmail.trim().toLowerCase();
    if (!betaListingId) { showNotice("Choose a product before adding a tester."); return; }
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) { showNotice("Enter a valid tester email address."); return; }
    if (!isSupabaseConfigured) { showNotice("Beta testing needs the MAS backend configuration."); return; }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in to manage beta testers."); setTab("Profile"); return; }
    setBetaSaving(true);
    const { data, error } = await supabase.from("beta_testers")
      .insert({ listing_id: betaListingId, owner_id: authData.user.id, email, channel: betaChannel, status: "invited" })
      .select("id,listing_id,email,channel,status,created_at").single();
    setBetaSaving(false);
    if (error || !data) { showNotice(error?.code === "23505" ? "This email is already on the tester list for this product." : error?.message || "Could not add this tester."); return; }
    setBetaTesters((items) => [data, ...items]);
    await writeTeamActivity(authData.user.id, authData.user.id, "Added beta tester", email);
    setBetaTesterEmail("");
    showNotice("Tester added to the release test list. An invitation email is not sent by this native screen.");
  };

  const updateBetaFeedbackStatus = async (feedback: any, status: "open" | "in_progress" | "resolved") => {
    if (!isSupabaseConfigured) return;
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in to manage beta feedback."); return; }
    const { data, error } = await supabase.from("beta_feedback").update({ status })
      .eq("id", feedback.id).eq("owner_id", authData.user.id).select("id,status").maybeSingle();
    if (error || !data) { showNotice(error?.message || "Could not update feedback status."); return; }
    setBetaFeedback((items) => items.map((item) => item.id === feedback.id ? { ...item, status } : item));
    showNotice("Feedback status updated.");
  };

  const addPortfolioProject = async () => {
    const title = portfolioTitle.trim();
    const description = portfolioDescription.trim();
    const url = portfolioUrl.trim();
    if (title.length < 1 || title.length > 100) { showNotice("Project title must contain 1 to 100 characters."); return; }
    if (!/^https:\/\//i.test(url)) { showNotice("Enter a valid HTTPS project URL."); return; }
    if (description.length > 500) { showNotice("Project description must be 500 characters or fewer."); return; }
    if (!isSupabaseConfigured) { showNotice("Portfolio management needs the MAS backend configuration."); return; }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in to update your portfolio."); setTab("Profile"); return; }
    setPortfolioSaving(true);
    const { data, error } = await supabase.from("developer_portfolio_projects").insert({
      developer_id: authData.user.id,
      title,
      description: description || null,
      project_type: portfolioType,
      url,
    }).select("id,title,description,project_type,url,created_at").single();
    setPortfolioSaving(false);
    if (error || !data) { showNotice(error?.message || "Could not add this portfolio project."); return; }
    setPortfolioProjects((items) => [data, ...items]);
    setPortfolioTitle("");
    setPortfolioDescription("");
    setPortfolioUrl("");
    showNotice("Portfolio project added.");
  };

  const removePortfolioProject = async (project: any) => {
    if (!isSupabaseConfigured) return;
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in to manage your portfolio."); return; }
    const { error } = await supabase.from("developer_portfolio_projects").delete()
      .eq("id", project.id).eq("developer_id", authData.user.id);
    if (error) { showNotice(error.message || "Could not remove this project."); return; }
    setPortfolioProjects((items) => items.filter((item) => item.id !== project.id));
    showNotice("Portfolio project removed.");
  };

  const submitSpotlightApplication = async () => {
    if (spotlightPitch.trim().length < 30) { showNotice("Tell us a little more, at least 30 characters."); return; }
    if (!isSupabaseConfigured) { showNotice("Spotlight applications need the MAS backend configuration."); return; }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in to apply for Spotlight."); setTab("Profile"); return; }
    setSpotlightSaving(true);
    const { data, error } = await supabase.from("spotlight_applications").insert({
      developer_id: authData.user.id,
      listing_id: spotlightListingId || null,
      opportunity: spotlightOpportunity,
      pitch: spotlightPitch.trim(),
    }).select("id,listing_id,opportunity,pitch,status,created_at").single();
    setSpotlightSaving(false);
    if (error || !data) { showNotice(error?.message || "Could not submit the Spotlight application."); return; }
    setSpotlightApplications((items) => [data, ...items]);
    setSpotlightPitch("");
    showNotice("Spotlight application submitted.");
  };

  const respondToConnection = async (connection: any, status: "accepted" | "declined") => {
    if (!isSupabaseConfigured) { showNotice("Connections need the MAS backend configuration."); return; }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in to manage connection requests."); setTab("Profile"); return; }
    if (connection.recipient_id !== authData.user.id || connection.status !== "pending") {
      showNotice("Only the recipient can respond to a pending request.");
      return;
    }
    const { data, error } = await supabase.from("social_connections")
      .update({ status })
      .eq("id", connection.id)
      .eq("recipient_id", authData.user.id)
      .eq("status", "pending")
      .select("id,status").maybeSingle();
    if (error || !data) { showNotice(error?.message || "This request has changed. Refresh your connections."); return; }
    setSocialConnections((items) => items.map((item) => item.id === connection.id ? { ...item, status } : item));
    showNotice(status === "accepted" ? "Connection accepted." : "Connection request declined.");
  };

  const removeConnection = async (connection: any) => {
    if (!isSupabaseConfigured) { showNotice("Connections need the MAS backend configuration."); return; }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in to manage connections."); return; }
    const { error } = await supabase.from("social_connections")
      .delete().eq("id", connection.id)
      .or(`requester_id.eq.${authData.user.id},recipient_id.eq.${authData.user.id}`);
    if (error) { showNotice(error.message || "Could not remove this connection."); return; }
    setSocialConnections((items) => items.filter((item) => item.id !== connection.id));
    showNotice("Connection removed.");
  };

  const markSocialNotificationRead = async (notification: any) => {
    if (!isSupabaseConfigured) return;
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in to manage Social activity."); return; }
    const { error } = await supabase.from("social_notifications").update({ read: true })
      .eq("id", notification.id).eq("user_id", authData.user.id);
    if (error) { showNotice(error.message || "Could not mark activity as read."); return; }
    setSocialNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, read: true } : item));
  };

  const publishInvestmentOpportunity = async () => {
    const title = investmentTitle.trim();
    const description = investmentDescription.trim();
    const industry = investmentIndustry.trim();
    const goal = investmentGoal.trim() ? Number(investmentGoal) : null;
    if (title.length < 3 || description.length < 20 || industry.length < 2) {
      showNotice("Add a title, at least 20 characters of detail, and an industry.");
      return;
    }
    if (goal !== null && (!Number.isFinite(goal) || goal <= 0)) {
      showNotice("Funding goal must be a positive number.");
      return;
    }
    if (!isSupabaseConfigured) { showNotice("Investment listings need the MAS backend configuration."); return; }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in to publish an opportunity."); setTab("Profile"); return; }
    setInvestmentSaving(true);
    const { data, error } = await supabase.from("social_investment_opportunities").insert({
      founder_id: authData.user.id,
      title,
      description,
      industry,
      stage: investmentStage,
      funding_goal: goal,
      currency: investmentCurrency,
      use_of_funds: investmentUse.trim() || null,
      status: "open",
    }).select("id,founder_id,title,description,industry,stage,funding_goal,currency,use_of_funds,status,created_at").single();
    setInvestmentSaving(false);
    if (error || !data) { showNotice(error?.message || "Could not publish this opportunity."); return; }
    setInvestmentOpportunities((items) => [{ ...data, founderName: authData.user.email || "You", isOwner: true }, ...items]);
    setInvestmentTitle("");
    setInvestmentDescription("");
    setInvestmentIndustry("Technology");
    setInvestmentStage("idea");
    setInvestmentGoal("");
    setInvestmentCurrency("MWK");
    setInvestmentUse("");
    showNotice("Your investment opportunity is published. Contact and funding arrangements remain between the parties.");
  };

  const changeInvestmentStatus = async (opportunity: any, status: "open" | "paused" | "closed") => {
    if (!isSupabaseConfigured) return;
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in to manage your opportunity."); return; }
    const { data, error } = await supabase.from("social_investment_opportunities")
      .update({ status }).eq("id", opportunity.id).eq("founder_id", authData.user.id)
      .select("id,status").maybeSingle();
    if (error || !data) { showNotice(error?.message || "Only the owner can change this opportunity."); return; }
    setInvestmentOpportunities((items) => items.map((item) => item.id === opportunity.id ? { ...item, status } : item));
    showNotice(status === "open" ? "Opportunity reopened." : status === "paused" ? "Opportunity paused." : "Opportunity closed.");
  };

  const saveVerificationPhone = async () => {
    const normalized = verificationPhone.trim();
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      showNotice("Enter a valid international phone number, for example +265991234567.");
      return;
    }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in to save your contact number."); return; }
    setVerificationSaving(true);
    const { error } = await supabase.from("profiles").update({ phone: normalized }).eq("id", authData.user.id);
    setVerificationSaving(false);
    showNotice(error ? (error.message || "Could not save your contact number.") : "Contact number saved.");
  };

  const chooseVerificationDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "application/pdf"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (asset.size && asset.size > 10 * 1024 * 1024) {
      showNotice("Choose a document smaller than 10 MB.");
      return;
    }
    setVerificationDocument({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType || (asset.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg"),
      size: asset.size ?? null,
    });
  };

  const submitManualVerification = async () => {
    if (!MANUAL_KYC_UPLOAD_ENABLED) { showNotice("Manual ID upload is disabled until private KYC storage is configured. Use Didit verification instead."); return; }
    const fullName = verificationFullName.trim();
    const idNumber = verificationIdNumber.trim();
    if (fullName.length < 3) { showNotice("Enter your full legal name."); return; }
    if (idNumber.length < 4) { showNotice("Enter a valid document number."); return; }
    if (!verificationDocument) { showNotice("Attach a national ID or passport image/PDF."); return; }
    if (!isSupabaseConfigured) { showNotice("Verification needs the MAS backend configuration."); return; }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in to submit verification."); setTab("Profile"); return; }
    const { data: profile, error: profileError } = await supabase.from("profiles").select("is_developer,kyc_status").eq("id", authData.user.id).maybeSingle();
    if (profileError || !profile) { showNotice(profileError?.message || "Could not verify your developer account."); return; }
    if (profile.is_developer !== true) { showNotice("Only developer accounts can submit identity verification."); return; }
    if (profile.kyc_status === "approved") { setVerificationStatus("approved"); showNotice("Your identity is already verified."); return; }
    if (profile.kyc_status === "pending") { setVerificationStatus("pending"); showNotice("Your verification is already pending review. Refresh status later."); return; }
    setVerificationSaving(true);
    try {
      const response = await fetch(verificationDocument.uri);
      const blob = await response.blob();
      const safeName = verificationDocument.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${authData.user.id}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("kyc-docs").upload(path, blob, {
        contentType: verificationDocument.mimeType,
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const { error: insertError } = await supabase.from("kyc_submissions").insert({
        user_id: authData.user.id,
        full_name: fullName,
        id_type: verificationIdType,
        id_number: idNumber,
        document_url: path,
        status: "pending",
      });
      if (insertError) throw insertError;
      const { error: profileError } = await supabase.from("profiles").update({ kyc_status: "pending" }).eq("id", authData.user.id);
      if (profileError) throw profileError;
      setVerificationStatus("pending");
      setVerificationDocument(null);
      setVerificationIdNumber("");
      showNotice("Verification submitted for manual review.");
    } catch (error: any) {
      showNotice(error?.message || "Could not submit verification.");
    } finally {
      setVerificationSaving(false);
    }
  };

  const startDiditVerification = async () => {
    if (!isSupabaseConfigured) { showNotice("Verification needs the MAS backend configuration."); return; }
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) { showNotice("Your session has expired. Sign in again."); setTab("Profile"); return; }
    setDiditLoading(true);
    try {
      const response = await fetch("https://malawian-app-store-j6pm.vercel.app/api/public/didit/session", {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const result = await response.json().catch(() => ({})) as { url?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not start Didit verification.");
      if (!result.url) throw new Error("Didit did not return a verification link.");
      const verificationUrl = new URL(result.url);
      if (verificationUrl.protocol !== "https:" || !(verificationUrl.hostname === "verify.didit.me" || verificationUrl.hostname.endsWith(".didit.me"))) {
        throw new Error("Didit returned an unexpected verification link.");
      }
      await Linking.openURL(verificationUrl.toString());
      showNotice("Complete the secure Didit flow, then return here and refresh your status.");
    } catch (error: any) {
      showNotice(error?.message || "Could not start Didit verification.");
    } finally {
      setDiditLoading(false);
    }
  };

  const refreshVerificationStatus = async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in to refresh verification status."); return; }
    const { data, error } = await supabase.from("profiles").select("phone,kyc_status").eq("id", authData.user.id).maybeSingle();
    if (error) { showNotice(error.message || "Could not refresh verification status."); return; }
    setVerificationPhone(data?.phone || "");
    setVerificationStatus(data?.kyc_status || "none");
    showNotice("Verification status refreshed.");
  };

  const openConversation = async (recipientId: string) => {
    if (!isSupabaseConfigured) { showNotice("Messaging needs the MAS Supabase connection."); return; }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in from Profile to message members."); setTab("Profile"); return; }
    if (recipientId === authData.user.id) { showNotice("You cannot message your own account."); return; }
    setCurrentUserId(authData.user.id);
    setActiveConversationUserId(recipientId);
    setSocialSection("Messages");
    setMessagesLoading(true);
    const { data, error } = await supabase.from("social_messages").select("id,sender_id,recipient_id,body,created_at,read_at")
      .or(`and(sender_id.eq.${authData.user.id},recipient_id.eq.${recipientId}),and(sender_id.eq.${recipientId},recipient_id.eq.${authData.user.id})`)
      .order("created_at", { ascending: true }).limit(200);
    if (error) { setMessagesLoading(false); showNotice(error.message || "Could not load this conversation."); return; }
    const rows = data ?? [];
    setMessages(rows);
    const unreadIds = rows.filter((item: any) => item.recipient_id === authData.user.id && !item.read_at).map((item: any) => item.id);
    if (unreadIds.length) await supabase.from("social_messages").update({ read_at: new Date().toISOString() }).in("id", unreadIds);
    setMessagesLoading(false);
  };

  const sendDirectMessage = async () => {
    const body = messageDraft.trim();
    if (!body || !activeConversationUserId) return;
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in to send messages."); setTab("Profile"); return; }
    setMessageSending(true);
    const { data, error } = await supabase.from("social_messages")
      .insert({ sender_id: authData.user.id, recipient_id: activeConversationUserId, body })
      .select("id,sender_id,recipient_id,body,created_at,read_at").single();
    setMessageSending(false);
    if (error || !data) { showNotice(error?.message || "Message could not be sent."); return; }
    setMessages((current) => [...current, data]);
    setMessageDraft("");
  };

  const toggleLike = async (postId: string) => {
    if (!isSupabaseConfigured) { showNotice("Live reactions need Supabase configuration."); return; }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in from Profile to react to posts."); setTab("Profile"); return; }
    const alreadyLiked = likedPostIds.includes(postId);
    if (alreadyLiked) {
      const { error } = await supabase.from("social_post_reactions").delete().eq("post_id", postId).eq("user_id", authData.user.id);
      if (error) { showNotice(error.message || "Could not remove reaction."); return; }
      setLikedPostIds((current) => current.filter((id) => id !== postId));
      setReactionCounts((current) => ({ ...current, [postId]: Math.max(0, (current[postId] ?? 1) - 1) }));
      return;
    }
    const { error } = await supabase.from("social_post_reactions").insert({ post_id: postId, user_id: authData.user.id });
    if (error) { showNotice(error.code === "23505" ? "You have already liked this post." : error.message || "Could not react to post."); return; }
    setLikedPostIds((current) => [...current, postId]);
    setReactionCounts((current) => ({ ...current, [postId]: (current[postId] ?? 0) + 1 }));
  };

  const requestConnection = async (recipientId?: string, postId?: string) => {
    if (!recipientId || !postId) { showNotice("This preview post has no member profile to connect with yet."); return; }
    if (!isSupabaseConfigured) { showNotice("Connections need Supabase configuration."); return; }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in from Profile to connect with members."); setTab("Profile"); return; }
    if (authData.user.id === recipientId) { showNotice("That is your own post."); return; }
    setConnectingPostIds((current) => [...current, postId]);
    const { error } = await supabase.from("social_connections").insert({ requester_id: authData.user.id, recipient_id: recipientId, status: "pending" });
    setConnectingPostIds((current) => current.filter((id) => id !== postId));
    if (error) { showNotice(error.code === "23505" ? "A connection request already exists." : error.message || "Could not send connection request."); return; }
    showNotice("Connection request sent.");
  };

  const publishSocialSectionPost = async () => {
    const body = sectionPostDraft.trim();
    if (body.length < 20) { showNotice("Please write at least 20 characters so members understand your post."); return; }
    if (!isSupabaseConfigured) { showNotice("Publishing needs the MAS backend configuration."); return; }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in from Profile to publish in Social."); setTab("Profile"); return; }
    setSectionPosting(true);
    const prefix = "[" + socialSection.toUpperCase() + "] ";
    const { data, error } = await supabase.from("social_posts").insert({ author_id: authData.user.id, body: prefix + body }).select("id,created_at").single();
    setSectionPosting(false);
    if (error || !data) { showNotice(error?.message || "Could not publish your post."); return; }
    setPosts((current) => [{ id: data.id, authorId: authData.user.id, name: authData.user.email || "You", tag: new Date(data.created_at || Date.now()).toLocaleDateString(), text: prefix + body, createdAt: data.created_at }, ...current]);
    setSectionPostDraft("");
    setFeedSource("live");
    showNotice("Your " + socialSection + " post is live.");
  };

  const toggleComments = async (postId: string) => {
    if (openCommentsPostId === postId) { setOpenCommentsPostId(null); return; }
    setOpenCommentsPostId(postId);
    if (commentsByPost[postId] || !isSupabaseConfigured) return;
    setCommentLoadingPostId(postId);
    const { data, error } = await supabase.from("social_post_comments").select("id,author_id,body,created_at").eq("post_id", postId).order("created_at", { ascending: true }).limit(100);
    if (error) { showNotice(error.message || "Could not load comments."); setCommentLoadingPostId(null); return; }
    const authorIds = [...new Set((data ?? []).map((item: any) => item.author_id))];
    const { data: profiles } = authorIds.length ? await supabase.from("public_profiles").select("id,display_name,developer_name").in("id", authorIds) : { data: [] as any[] };
    const names = new Map((profiles ?? []).map((profile: any) => [profile.id, profile.developer_name || profile.display_name || "MAS member"]));
    setCommentsByPost((current) => ({ ...current, [postId]: (data ?? []).map((item: any) => ({ id: item.id, name: String(names.get(item.author_id) || "MAS member"), body: item.body, createdAt: item.created_at })) }));
    setCommentLoadingPostId(null);
  };

  const sendComment = async (postId: string) => {
    const body = (commentDrafts[postId] ?? "").trim();
    if (!body) return;
    if (!isSupabaseConfigured) { showNotice("Live comments need Supabase configuration."); return; }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in from Profile to comment."); setTab("Profile"); return; }
    setCommentSendingPostId(postId);
    const { data, error } = await supabase.from("social_post_comments").insert({ post_id: postId, author_id: authData.user.id, body }).select("id,created_at").single();
    if (error || !data) { setCommentSendingPostId(null); showNotice(error?.message || "Your comment could not be sent."); return; }
    setCommentsByPost((current) => ({ ...current, [postId]: [...(current[postId] ?? []), { id: data.id, name: authData.user.email || "You", body, createdAt: data.created_at }] }));
    setCommentDrafts((current) => ({ ...current, [postId]: "" }));
    setCommentSendingPostId(null);
    showNotice("Comment added.");
  };

  const filteredSocialPosts = useMemo(() => {
    const q = socialSearchQuery.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter((post) => `${post.name} ${post.text}`.toLowerCase().includes(q));
  }, [posts, socialSearchQuery]);

  const filteredApps = useMemo(() => {
    return apps.filter((app) =>
      matchesSearch([app.name, app.category, app.description], query) &&
      matchesListingFilters(app, { category, kind: kindFilter })
    );
  }, [apps, query, category, kindFilter]);

  const topCharts = useMemo(() => topByNumber(filteredApps, (app) => app.downloads), [filteredApps]);
  const topRated = useMemo(() => topByNumber(filteredApps, (app) => app.rating), [filteredApps]);
  const recentApps = useMemo(() => topByDate(filteredApps, (app) => app.createdAt), [filteredApps]);

  const showNotice = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(""), 2800);
  };

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem("mas:accent").then((stored) => {
      if (active && stored && /^#[0-9a-f]{6}$/i.test(stored)) setAccentColor(stored);
    }).catch(() => undefined).finally(() => {
      if (active) setAccentLoaded(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (accentLoaded) AsyncStorage.setItem("mas:accent", accentColor).catch(() => undefined);
  }, [accentColor, accentLoaded]);

  const handleEmailAuth = async () => {
    if (!isSupabaseConfigured) {
      showNotice("Account sign-in is unavailable because this build has no MAS backend configuration.");
      return;
    }
    const email = authEmail.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      showNotice("Enter a valid email address.");
      return;
    }
    if (authPassword.length < 6) {
      showNotice("Password must contain at least 6 characters.");
      return;
    }
    setAuthLoading(true);
    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: authPassword,
          options: { emailRedirectTo: "mw.wealthgrid.mas://auth/callback" },
        });
        if (error) throw error;
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          throw new Error("An account may already exist for this email. Try signing in or use password recovery.");
        }
        setAuthPassword("");
        if (data.session) {
          setUserEmail(data.user?.email ?? email);
          showNotice("Your MAS account has been created.");
        } else {
          setAuthMode("signin");
          showNotice("Account created. Check your email to confirm your address, then sign in.");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: authPassword });
        if (error) throw error;
        setUserEmail(data.user?.email ?? email);
        setAuthPassword("");
        showNotice("You are signed in to MAS.");
      }
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Authentication failed. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  };

  const navigateDrawer = (destination: "Explore" | "Library" | "Alerts" | "Account" | "Social" | "Develop" | "Settings") => {
    setDrawerOpen(false);
    setSelectedApp(null);
    setDeveloperScreen(null);
    if (destination === "Library") {
      setTab("Profile");
      setUtilityScreen("library");
    } else if (destination === "Alerts") {
      setTab("Profile");
      setUtilityScreen("notifications");
    } else if (destination === "Settings") {
      setTab("Profile");
      setUtilityScreen("settings");
    } else {
      setUtilityScreen("none");
      if (destination === "Develop") {
        setTab("Develop");
        setDeveloperScreen("Developer dashboard");
      } else {
        setTab(destination === "Account" ? "Profile" : destination);
      }
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ExpoStatusBar style="dark" />
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.app}>
        <View style={[styles.header, { paddingHorizontal: windowWidth < 360 ? 8 : 12 }]}>
          <View style={styles.headerSearchBox}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open navigation menu" onPress={() => setDrawerOpen(true)} style={styles.headerMenuButton}>
              <NativeIcon name="menu" color={COLORS.text} size={20} />
            </TouchableOpacity>
            <Image accessibilityLabel="Malawian App Store logo" source={require("./assets/mas-logo-mark.png")} style={styles.headerLogo} resizeMode="contain" />
            <NativeIcon name="search" color={COLORS.muted} size={18} />
            <TextInput
              accessibilityLabel="Search apps and websites"
              placeholder="Search apps & websites"
              placeholderTextColor={COLORS.muted}
              value={query}
              onChangeText={setQuery}
              style={styles.headerSearchInput}
              returnKeyType="search"
              maxLength={120}
            />
          </View>
        </View>

        <Modal visible={drawerOpen} transparent animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
          <View style={styles.drawerRoot}>
            <View style={[styles.drawerPanel, { width: drawerWidth, maxWidth: isTabletLayout ? 420 : 360, paddingTop: Math.max(16, (StatusBar.currentHeight ?? 0) + 8), paddingBottom: windowHeight < 520 ? 12 : 20 }]}>
              <View style={styles.drawerHeader}>
                <Text style={styles.drawerTitle}>Malawian App Store</Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close menu" onPress={() => setDrawerOpen(false)}>
                  <Text style={styles.drawerClose}>×</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ paddingBottom: 24, flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
              <Text style={styles.drawerSection}>NAVIGATION</Text>
              {([
                ["Explore", "apps", "Explore apps and websites"],
                ["Library", "book", "Saved and installed apps"],
                ["Alerts", "bell", "Notifications"],
                ["Account", "user", "Your MAS account"],
                ["Social", "users", "Community and messages"],
                ["Develop", "grid", "Developer space"],
                ["Settings", "settings", "Appearance and preferences"],
              ] as const).map(([label, icon, description]) => (
                <TouchableOpacity key={label} accessibilityRole="button" style={[styles.drawerItem, { paddingVertical: windowHeight < 600 ? 9 : 13 }]} onPress={() => navigateDrawer(label)}>
                  <NativeIcon name={icon} color={accentColor} size={20} />
                  <View style={styles.drawerItemCopy}>
                    <Text style={styles.drawerItemTitle}>{label}</Text>
                    <Text style={styles.drawerItemDescription}>{description}</Text>
                  </View>
                  <Text style={styles.drawerChevron}>›</Text>
                </TouchableOpacity>
              ))}
              <Text style={styles.drawerSection}>DEVELOPER SPACE</Text>
              {([
                ["Developer dashboard", "Overview and publishing status"],
                ["Publish a product", "Create an app or website listing"],
                ["My applications", "Manage your products and releases"],
                ["Analytics", "Views, installs and performance"],
                ["Verification", "Developer identity status"],
                ["Developer Pro", "Subscription and benefits"],
                ["Developer wallet", "Earnings and wallet information"],
                ["Console settings", "Developer preferences"],
                ["Reviews", "Customer feedback and replies"],
                ["Publishing checklist", "Release readiness"],
                ["Quality checks", "Product quality and policy"],
                ["Developer resources", "Guides and support"],
                ["Testing", "Release and account testing"],
                ["Team management", "Team members and roles"],
                ["Promote a product", "Campaigns and promotion"],
                ["Spotlight", "Featured product applications"],
                ["My public profile", "Your developer profile"],
                ["Security", "Account and app security"],
                ["Store management", "Manage product listings"],
                ["Developer assistant", "Help with developer workflows"],
              ] as const).map(([label, description]) => (
                <TouchableOpacity key={label} accessibilityRole="button" style={[styles.drawerItem, { paddingVertical: windowHeight < 600 ? 9 : 13 }]} onPress={() => {
                  setDrawerOpen(false);
                  setSelectedApp(null);
                  setUtilityScreen("none");
                  setTab("Develop");
                  setDeveloperScreen(label);
                }}>
                  <NativeIcon name={label === "Developer dashboard" || label === "Store management" ? "grid" : label === "Publish a product" || label === "Testing" ? "apps" : label === "My applications" || label === "Publishing checklist" || label === "Developer resources" ? "book" : label === "Analytics" || label === "Promote a product" ? "search" : label === "Verification" || label === "My public profile" ? "user" : label === "Team management" || label === "Reviews" || label === "Developer assistant" ? "users" : "settings"} color={accentColor} size={19} />
                  <View style={styles.drawerItemCopy}>
                    <Text style={styles.drawerItemTitle}>{label}</Text>
                    <Text style={styles.drawerItemDescription}>{description}</Text>
                  </View>
                  <Text style={styles.drawerChevron}>›</Text>
                </TouchableOpacity>
              ))}
              <View style={styles.drawerFooter}>
                <Text style={styles.drawerFooterText}>Built for Malawi · Powered by Wealth Grid Finance</Text>
              </View>
              </ScrollView>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close navigation menu" style={styles.drawerBackdrop} onPress={() => setDrawerOpen(false)} />
          </View>
        </Modal>

        <ScrollView style={styles.content} contentContainerStyle={[styles.contentInner, { width: "100%", maxWidth: contentMaxWidth, alignSelf: "center", paddingHorizontal: windowWidth < 360 ? 8 : 12 }]} keyboardShouldPersistTaps="handled">
          {selectedApp ? (
            <>
              <TouchableOpacity accessibilityRole="button" style={styles.secondaryButton} onPress={() => setSelectedApp(null)}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>← Back to store</Text></TouchableOpacity>
              <View style={styles.detailHero}>
                <View style={[styles.detailIcon, { backgroundColor: selectedApp.color }]}>{selectedApp.iconUrl ? <Image source={{ uri: selectedApp.iconUrl }} style={styles.detailIconImage} resizeMode="cover" /> : <Text style={styles.detailIconText}>{selectedApp.mark}</Text>}</View>
                <Text style={styles.detailTitle}>{selectedApp.name}</Text>
                <Text style={[styles.detailCategory,{color:accentColor}]}>{selectedApp.category} · {selectedApp.kind === "website" ? "Website" : "App"}</Text>
                <Text style={styles.detailDescription}>{selectedApp.description || "Discover this project from a Malawian developer."}</Text>
                <View style={styles.detailStats}>
                  <View style={styles.detailStat}><Text style={styles.detailStatValue}>{(selectedApp.rating ?? 0) > 0 ? (selectedApp.rating ?? 0).toFixed(1) : "New"}</Text><Text style={styles.detailStatLabel}>Rating</Text></View>
                  <View style={styles.detailStat}><Text style={styles.detailStatValue}>{(selectedApp.downloads ?? 0).toLocaleString()}</Text><Text style={styles.detailStatLabel}>Downloads</Text></View>
                  <View style={styles.detailStat}><Text style={styles.detailStatValue}>{selectedApp.developer || "MAS developer"}</Text><Text style={styles.detailStatLabel}>Developer</Text></View>
                </View>
              </View>
              <TouchableOpacity style={[[styles.primaryButton,{backgroundColor:accentColor}], { backgroundColor: accentColor }]} onPress={async () => {
                if (!isSupabaseConfigured) { showNotice("Saving listings requires the live MAS backend."); return; }
                if (!isSupabaseConfigured) { showNotice("Saving needs the MAS backend configuration."); return; }
                const { data: authData, error: authError } = await supabase.auth.getUser();
                if (authError || !authData.user) { showNotice("Sign in to save this listing to your library."); setSelectedApp(null); setTab("Profile"); return; }
                const { error } = await supabase.from("wishlist").insert({ user_id: authData.user.id, listing_id: selectedApp.id });
                showNotice(error ? (error.code === "23505" ? "This listing is already saved." : error.message || "Could not save listing.") : "Saved to your library.");
              }}><Text style={styles.primaryButtonText}>＋ Save to my library</Text></TouchableOpacity>
              <TouchableOpacity style={[[styles.primaryButton,{backgroundColor:accentColor}], { backgroundColor: accentColor }]} onPress={() => void installSelectedApp()} disabled={detailLoading}>
                <Text style={styles.primaryButtonText}>{selectedApp.kind === "website" ? "Open website" : "Download / install"}</Text>
              </TouchableOpacity>
              {detailLoading ? <ActivityIndicator color={accentColor} style={{ marginVertical: 16 }} /> : null}
              {selectedAppDetails ? <>
                <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>About this listing</Text><Text style={styles.sectionMeta}>{selectedAppDetails.price_mwk > 0 ? "MK" + Number(selectedAppDetails.price_mwk).toLocaleString() : "FREE"}</Text></View>
                <Text style={styles.detailDescription}>{selectedAppDetails.description || selectedAppDetails.tagline || selectedApp.description}</Text>
                {selectedAppDetails.monetization ? <Text style={styles.disclaimer}>Monetization: {selectedAppDetails.monetization}</Text> : null}
                {selectedScreenshotUrls.length ? <><View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Screenshots</Text><Text style={styles.sectionMeta}>{selectedScreenshotUrls.length}</Text></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nativeShelfRow}>{selectedScreenshotUrls.map((url, index) => <Image key={`${url}-${index}`} accessibilityLabel={`Product screenshot ${index + 1}`} source={{ uri: url }} style={styles.listingScreenshot} resizeMode="cover" />)}</ScrollView></> : null}
              </> : null}
              <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Versions</Text><Text style={styles.sectionMeta}>{selectedVersions.length}</Text></View>
              {selectedVersions.map((version) => <View key={version.id} style={styles.toolCard}><View style={styles.toolCopy}><Text style={styles.toolTitle}>Version {version.version}{version.status === "published" ? " · Release" : " · " + version.status}</Text><Text style={styles.toolDescription}>{version.release_notes || version.changelog || "No release notes provided."}</Text>{version.size_bytes ? <Text style={styles.postTag}>{(version.size_bytes / 1048576).toFixed(1)} MB · {new Date(version.created_at).toLocaleDateString()}</Text> : null}</View></View>)}
              {!detailLoading && !selectedVersions.length ? <Text style={styles.emptyText}>No version history is available yet.</Text> : null}
              <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Reviews</Text><Text style={styles.sectionMeta}>{selectedReviews.length}</Text></View>
              {selectedReviews.map((review) => <View key={review.id} style={styles.toolCard}><View style={styles.toolCopy}><Text style={styles.toolTitle}>{"★".repeat(Math.max(1, Math.min(5, Number(review.rating) || 1)))} · {review.rating}/5</Text><Text style={styles.toolDescription}>{review.body || "No written review."}</Text><Text style={styles.postTag}>{new Date(review.created_at).toLocaleDateString()}</Text></View></View>)}
              {!detailLoading && !selectedReviews.length ? <Text style={styles.emptyText}>No reviews yet. Be the first to review this listing.</Text> : null}
              <View style={styles.composeCard}><Text style={styles.toolTitle}>Write a review</Text><View style={styles.ratingRow}>{[1,2,3,4,5].map((value) => <TouchableOpacity key={value} onPress={() => setReviewRating(value)}><Text style={[styles.ratingStar, value <= reviewRating && styles.ratingStarActive]}>★</Text></TouchableOpacity>)}</View><TextInput accessibilityLabel="Write a listing review" placeholder="Share your experience (optional)…" placeholderTextColor={COLORS.muted} value={reviewDraft} onChangeText={(value) => setReviewDraft(value.slice(0, 2000))} multiline maxLength={2000} style={styles.commentInput}/><TouchableOpacity style={[[styles.composeButton,{backgroundColor:accentColor}],{alignSelf:"flex-end",marginTop:10}]} onPress={() => void submitSelectedReview()}><Text style={styles.composeButtonText}>Submit review</Text></TouchableOpacity></View>
              <Text style={styles.disclaimer}>Downloads open through a short-lived signed link. Reviews and installs use the MAS backend policies.</Text>
            </>
          ) : null}

          {!selectedApp && utilityScreen === "none" && developerScreen === null && tab === "Explore" && (
            <>
              <View style={styles.storeTabs}>
                {([
                  ["all", "For you"],
                  ["app", "Apps"],
                  ["website", "Websites"],
                ] as ["all" | "app" | "website", string][]).map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setKindFilter(key)}
                    style={[styles.storeTab, kindFilter === key && [styles.storeTabActive,{borderBottomColor:accentColor}]]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: kindFilter === key }}
                  >
                    <Text style={[styles.storeTabText, kindFilter === key && [styles.storeTabTextActive,{color:accentColor}]]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {["All", ...CATEGORIES].map((item) => (
                  <TouchableOpacity key={item} onPress={() => setCategory(item)} style={[styles.chip, category === item && [styles.chipActive,{borderColor:accentColor,backgroundColor:accentColor+"18"}]]}>
                    <Text style={[styles.chipText, category === item && [styles.chipTextActive,{color:accentColor}]]}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {!catalogueLoading && filteredApps.length > 0 && !query.trim() && category === "All" && kindFilter === "all" ? [
                { title: "Recommended for you", items: recentApps },
                { title: "Top charts", items: topCharts },
                { title: "Top rated", items: topRated },
              ].map((shelf) => (
                <View key={shelf.title} style={styles.nativeShelf}>
                  <View style={styles.shelfHeading}><View style={styles.shelfHeadingCopy}><Text style={styles.sectionTitle}>{shelf.title}</Text><Text style={styles.shelfSubtitle}>{shelf.title === "Recommended for you" ? "Fresh from Malawian developers" : shelf.title === "Top charts" ? "Most popular this week" : "Loved by reviewers"}</Text></View><Text style={styles.shelfChevron}>›</Text></View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nativeShelfRow}>
                    {shelf.items.map((item) => (
                      <TouchableOpacity key={item.id} style={styles.nativeShelfItem} onPress={() => setSelectedApp(item)}>
                        <View style={[styles.nativeShelfIcon, { backgroundColor: item.iconUrl ? item.color : (accentColor + "18") }]}>{item.iconUrl ? <Image source={{ uri: item.iconUrl }} style={styles.nativeShelfIconImage} resizeMode="cover" /> : <Text style={[styles.appIconText, [styles.appIconFallbackText,{color:accentColor}]]}>{item.name.slice(0, 2).toUpperCase()}</Text>}</View>
                        <Text numberOfLines={1} style={styles.nativeShelfName}>{item.name}</Text>
                        <Text numberOfLines={1} style={styles.nativeShelfMeta}>{item.ratingCount ? item.rating?.toFixed(1) + " ★" : "New"}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )) : null}

              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>{query.trim() || category !== "All" || kindFilter !== "all" ? `${filteredApps.length} result${filteredApps.length === 1 ? "" : "s"}` : "All listings"}</Text>
                <Text style={styles.sectionMeta}>{catalogueLoading ? "SYNCING" : catalogueSource === "live" ? "MAS CATALOGUE" : catalogueSource === "error" ? "LOAD FAILED" : ""}</Text>
              </View>
              {catalogueLoading ? <ActivityIndicator color={accentColor} style={{ marginVertical: 16 }} /> : null}
              {filteredApps.length ? filteredApps.map((app) => (
                <TouchableOpacity key={app.id || app.name} style={styles.appCard} onPress={() => setSelectedApp(app)}>
                  <View style={[styles.appIcon, { backgroundColor: app.iconUrl ? app.color : (accentColor + "18") }]}>{app.iconUrl ? <Image source={{ uri: app.iconUrl }} style={styles.appIconImage} resizeMode="cover" /> : <Text style={[styles.appIconText, [styles.appIconFallbackText,{color:accentColor}]]}>{app.name.slice(0, 2).toUpperCase()}</Text>}</View>
                  <View style={styles.appDetails}>
                    <View style={styles.appNameRow}><Text numberOfLines={1} style={styles.appName}>{app.name}</Text><Text style={styles.kindGlyph}>{app.kind === "website" ? "◎" : "▣"}</Text></View>
                    <Text numberOfLines={1} style={styles.appCategory}>{app.tagline || app.category}</Text>
                    <View style={styles.appMetricRow}>
                      <Text style={styles.appMetricRating}>{(app.ratingCount ?? 0) > 0 ? (app.rating ?? 0).toFixed(1) : "New"}</Text>
                      <Text style={styles.appMetricStar}>★</Text>
                      <Text style={styles.appMetricDot}>·</Text>
                      <Text style={styles.appDescription}>{(app.downloads ?? 0).toLocaleString()} {app.kind === "website" ? "visits" : "installs"}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )) : <Text style={styles.emptyText}>No apps match that search. Try another category or search term.</Text>}

            </>
          )}

          {!selectedApp && utilityScreen === "none" && developerScreen === null && tab === "Social" && (
            <>
              <View style={styles.sectionHeading}><Text style={styles.pageTitle}>Social</Text><TouchableOpacity accessibilityRole="button" onPress={() => { setSocialSearchOpen((open) => !open); if (socialSearchOpen) setSocialSearchQuery(""); }} style={styles.secondaryButton}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>{socialSearchOpen ? "Close search" : "⌕ Search"}</Text></TouchableOpacity></View>
              <Text style={styles.pageIntro}>Ideas, people and technology — connected.</Text>
              {socialSearchOpen ? <View style={[styles.searchBox,{marginBottom:12}]}><Text style={styles.searchIcon}>⌕</Text><TextInput accessibilityLabel="Search Social posts" placeholder="Search posts and members" placeholderTextColor={COLORS.muted} value={socialSearchQuery} onChangeText={setSocialSearchQuery} style={styles.searchInput} returnKeyType="search" /></View> : null}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {(["Feed", "Messages", "Connections", "Activity", "Collabo", "Investors", "Grants", "Crowdfund"] as SocialSection[]).map((item) => (
                  <TouchableOpacity key={item} onPress={() => setSocialSection(item)} style={[styles.chip, socialSection === item && [styles.chipActive,{borderColor:accentColor,backgroundColor:accentColor+"18"}]]}>
                    <Text style={[styles.chipText, socialSection === item && [styles.chipTextActive,{color:accentColor}]]}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {socialSection === "Feed" ? (
                <>
                  <View style={styles.composeCard}>
                    <Text style={styles.composePrompt}>Share an idea with the community…</Text>
                    <TouchableOpacity accessibilityRole="button" style={styles.mediaAttachButton} onPress={() => void choosePostMedia()}>
                      <Text style={styles.mediaAttachText}>{selectedMedia ? (selectedMedia.type === "image" ? "▧ Photo selected · Change" : "▷ Video selected · Change") : "＋ Add photo or video"}</Text>
                    </TouchableOpacity>
                    {selectedMedia ? <View style={styles.selectedMedia}><Text style={styles.selectedMediaText}>{selectedMedia.fileName}</Text><TouchableOpacity onPress={() => setSelectedMedia(null)}><Text style={styles.removeMediaText}>Remove</Text></TouchableOpacity></View> : null}
                    <TextInput accessibilityLabel="Write a Social post" placeholder="What are you building or thinking about?" placeholderTextColor={COLORS.muted} value={postDraft} onChangeText={setPostDraft} multiline maxLength={2000} style={styles.postComposerInput} />
                    <View style={styles.composeFooter}><Text style={styles.composeLimit}>{postDraft.length}/2000</Text><TouchableOpacity disabled={posting || !postDraft.trim()} style={[[styles.composeButton,{backgroundColor:accentColor}], (posting || !postDraft.trim()) && { opacity: 0.5 }]} onPress={async () => {
                      if (!isSupabaseConfigured) { showNotice("Live posting is unavailable until Supabase is configured."); return; }
                      setPosting(true);
                      const { data: authData, error: authError } = await supabase.auth.getUser();
                      if (authError || !authData.user) { setPosting(false); showNotice("Sign in from Profile before publishing a post."); setTab("Profile"); return; }
                      const body = postDraft.trim();
                      let uploaded: { url: string; type: "image" | "video" } | null = null;
                      try {
                        uploaded = await uploadPostMedia(authData.user.id);
                      } catch (mediaError: any) {
                        setPosting(false);
                        showNotice(mediaError?.message || "Media upload failed. Check the social-media Storage bucket and its policies.");
                        return;
                      }
                      if (!body && !uploaded) { setPosting(false); showNotice("Write a message or attach media first."); return; }
                      const { data, error } = await supabase.from("social_posts").insert({
                        body: body || (uploaded?.type === "image" ? "Photo" : "Video"),
                        author_id: authData.user.id,
                        media_url: uploaded?.url ?? null,
                        media_type: uploaded?.type ?? null,
                      }).select("id,created_at,media_url,media_type").single();
                      if (error || !data) { setPosting(false); showNotice(error?.message || "Your post could not be published."); return; }
                      setPosts((current) => [{ id: data.id, authorId: authData.user.id, name: authData.user.email || "You", tag: new Date(data.created_at || Date.now()).toLocaleDateString(), text: body || (uploaded?.type === "image" ? "Photo" : "Video"), createdAt: data.created_at, mediaUrl: data.media_url ?? uploaded?.url ?? null, mediaType: data.media_type ?? uploaded?.type ?? null }, ...current]);
                      setFeedSource("live");
                      setPostDraft("");
                      setSelectedMedia(null);
                      setPosting(false);
                      showNotice("Your post is live on MAS Social.");
                    }}><Text style={styles.composeButtonText}>{posting ? "Publishing…" : "Publish post"}</Text></TouchableOpacity></View>
                  </View>
                  <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Community feed</Text><Text style={styles.sectionMeta}>{feedLoading ? "SYNCING" : feedSource === "live" ? "MAS SOCIAL" : feedSource === "error" ? "LOAD FAILED" : isSupabaseConfigured ? "NO SOCIAL POSTS" : "BACKEND NOT CONFIGURED"}</Text></View>
                  {filteredSocialPosts.map((post) => (
                    <View key={post.id || post.name} style={styles.postCard}>
                      <View style={styles.postHeader}><View style={styles.smallAvatar}><Text style={styles.smallAvatarText}>{post.name.charAt(0)}</Text></View><View style={styles.postIdentity}><Text style={styles.postName}>{post.name}</Text><Text style={styles.postTag}>{post.tag}</Text></View></View>
                      <Text style={styles.postText}>{post.text.replace(/^\[(COLLABO|INVESTORS|GRANTS|CROWDFUND)\]\s*/, "")}</Text>
                      {post.mediaUrl && post.mediaType === "image" ? <Image accessibilityLabel="Post attachment" source={{ uri: post.mediaUrl }} style={styles.postMediaImage} resizeMode="cover" /> : null}
                      {post.mediaUrl && post.mediaType === "video" ? <TouchableOpacity style={styles.mediaLink} onPress={() => void Linking.openURL(post.mediaUrl!)}><Text style={styles.mediaLinkText}>▷ Open attached video</Text></TouchableOpacity> : null}
                      <View style={styles.postActions}><TouchableOpacity onPress={() => void toggleLike(post.id)}><Text style={[styles.postAction, likedPostIds.includes(post.id) && { color: accentColor }]}>{likedPostIds.includes(post.id) ? "♥ Liked" : "♡ Like"}{reactionCounts[post.id] ? ` · ${reactionCounts[post.id]}` : ""}</Text></TouchableOpacity><TouchableOpacity onPress={() => void toggleComments(post.id)}><Text style={styles.postAction}>○ Comment{commentsByPost[post.id]?.length ? ` · ${commentsByPost[post.id].length}` : ""}</Text></TouchableOpacity><TouchableOpacity disabled={connectingPostIds.includes(post.id)} onPress={() => void requestConnection(post.authorId, post.id)}><Text style={styles.postAction}>{connectingPostIds.includes(post.id) ? "Sending…" : "↗ Connect"}</Text></TouchableOpacity><TouchableOpacity disabled={!post.authorId} onPress={() => post.authorId ? void openConversation(post.authorId) : showNotice("This preview post has no member to message.")}><Text style={styles.postAction}>✉ Message</Text></TouchableOpacity></View>{openCommentsPostId === post.id ? <View style={styles.commentsPanel}>{commentLoadingPostId === post.id ? <ActivityIndicator color={accentColor} /> : (commentsByPost[post.id] ?? []).map((comment) => <View key={comment.id} style={styles.commentItem}><Text style={styles.commentAuthor}>{comment.name}</Text><Text style={styles.commentBody}>{comment.body}</Text></View>)}<TextInput accessibilityLabel="Write a comment" placeholder="Write a comment…" placeholderTextColor={COLORS.muted} value={commentDrafts[post.id] ?? ""} onChangeText={(value) => setCommentDrafts((current) => ({ ...current, [post.id]: value.slice(0, 1000) }))} multiline maxLength={1000} style={styles.commentInput} /><TouchableOpacity disabled={commentSendingPostId === post.id || !(commentDrafts[post.id] ?? "").trim()} style={[[styles.composeButton,{backgroundColor:accentColor}], { alignSelf: "flex-end", marginTop: 8 }, (commentSendingPostId === post.id || !(commentDrafts[post.id] ?? "").trim()) && { opacity: 0.5 }]} onPress={() => void sendComment(post.id)}><Text style={styles.composeButtonText}>{commentSendingPostId === post.id ? "Sending…" : "Send comment"}</Text></TouchableOpacity></View> : null}
                    </View>
                  ))}
                </>
              ) : socialSection === "Messages" ? (
                <>
                  <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Messages</Text><Text style={styles.sectionMeta}>PRIVATE CHAT</Text></View>
                  {!activeConversationUserId ? (
                    <>
                      <Text style={styles.disclaimer}>Choose a member from a Social post to open a private conversation.</Text>
                      {conversationLoading ? <ActivityIndicator color={accentColor} style={{ marginVertical: 12 }} /> : null}
                      {conversationPreviews.map((conversation) => (
                        <TouchableOpacity key={conversation.userId} style={styles.toolCard} onPress={() => void openConversation(conversation.userId)}>
                          <View style={[styles.toolIcon,{backgroundColor:accentColor+"18"}]}><Text style={[styles.toolIconText,{color:accentColor}]}>{conversation.name.slice(0,1).toUpperCase()}</Text></View>
                          <View style={styles.toolCopy}>
                            <Text style={styles.toolTitle}>{conversation.name}{conversation.unread ? ` · ${conversation.unread} unread` : ""}</Text>
                            <Text numberOfLines={1} style={styles.toolDescription}>{conversation.body || "Open private conversation"}</Text>
                            <Text style={styles.postTag}>{conversation.createdAt ? new Date(conversation.createdAt).toLocaleString() : ""}</Text>
                          </View>
                          <Text style={styles.chevron}>›</Text>
                        </TouchableOpacity>
                      ))}
                      {!conversationLoading && !conversationPreviews.length ? (
                        <>
                          <Text style={styles.emptyText}>No conversations yet. Start one by selecting Message on a member's Social post.</Text>
                          {posts.filter((post) => post.authorId).map((post) => (
                            <TouchableOpacity key={post.authorId} style={styles.toolCard} onPress={() => post.authorId ? void openConversation(post.authorId) : undefined}>
                              <View style={[styles.toolIcon,{backgroundColor:accentColor+"18"}]}><Text style={[styles.toolIconText,{color:accentColor}]}>{post.name.slice(0,1).toUpperCase()}</Text></View>
                              <View style={styles.toolCopy}><Text style={styles.toolTitle}>{post.name}</Text><Text style={styles.toolDescription}>Start a private conversation</Text></View><Text style={styles.chevron}>›</Text>
                            </TouchableOpacity>
                          ))}
                        </>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <TouchableOpacity style={styles.secondaryButton} onPress={() => { setActiveConversationUserId(null); setMessages([]); }}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>← All conversations</Text></TouchableOpacity>
                      <View style={styles.messageThread}>
                        {messagesLoading ? <ActivityIndicator color={accentColor} /> : messages.length ? messages.map((message) => (
                          <View key={message.id} style={[styles.messageBubble, message.sender_id === currentUserId ? styles.messageOwn : styles.messageOther]}>
                            <Text style={styles.messageBody}>{message.body}</Text><Text style={styles.messageTime}>{new Date(message.created_at).toLocaleString()}</Text>
                          </View>
                        )) : <Text style={styles.emptyText}>No messages yet. Start the conversation below.</Text>}
                      </View>
                      <TextInput accessibilityLabel="Write a direct message" placeholder="Write a private message…" placeholderTextColor={COLORS.muted} value={messageDraft} onChangeText={(value) => setMessageDraft(value.slice(0,4000))} multiline maxLength={4000} style={styles.commentInput}/>
                      <TouchableOpacity disabled={messageSending || !messageDraft.trim()} style={[[styles.composeButton,{backgroundColor:accentColor}],{alignSelf:"flex-end",marginTop:8},(messageSending || !messageDraft.trim()) && {opacity:0.5}]} onPress={() => void sendDirectMessage()}><Text style={styles.composeButtonText}>{messageSending ? "Sending…" : "Send message"}</Text></TouchableOpacity>
                    </>
                  )}
                </>
              ) : socialSection === "Connections" ? (
                <>
                  <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Connections</Text><Text style={styles.sectionMeta}>MEMBER NETWORK</Text></View>
                  <Text style={styles.pageIntro}>Review incoming requests and manage the people you have connected with.</Text>
                  {!isSupabaseConfigured ? <Text style={styles.disclaimer}>Connect the MAS backend to load live connections.</Text> : null}
                  {socialConnectionsLoading ? <ActivityIndicator color={accentColor} /> : socialConnections.map((connection) => (
                    <View key={connection.id} style={styles.toolCard}>
                      <View style={[styles.toolIcon,{backgroundColor:accentColor+"18"}]}><Text style={[styles.toolIconText,{color:accentColor}]}>{String(connection.otherName || "M").slice(0,1).toUpperCase()}</Text></View>
                      <View style={styles.toolCopy}>
                        <Text style={styles.toolTitle}>{connection.otherName}</Text>
                        <Text style={styles.toolDescription}>{connection.direction === "incoming" ? "Incoming request" : "Request sent"} · {connection.status}</Text>
                        <Text style={styles.postTag}>{connection.created_at ? new Date(connection.created_at).toLocaleDateString() : ""}</Text>
                      </View>
                      {connection.status === "pending" && connection.direction === "incoming" ? <View style={{gap:8,alignItems:"flex-end"}}><TouchableOpacity onPress={() => void respondToConnection(connection,"accepted")}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>Accept</Text></TouchableOpacity><TouchableOpacity onPress={() => void respondToConnection(connection,"declined")}><Text style={styles.removeMediaText}>Decline</Text></TouchableOpacity></View> : connection.status === "accepted" ? <TouchableOpacity onPress={() => void openConversation(connection.otherUserId)}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>Message</Text></TouchableOpacity> : <TouchableOpacity onPress={() => void removeConnection(connection)}><Text style={styles.removeMediaText}>Remove</Text></TouchableOpacity>}
                    </View>
                  ))}
                  {!socialConnectionsLoading && !socialConnections.length ? <Text style={styles.emptyText}>No connection requests yet. Visit the Feed and connect with a member.</Text> : null}
                </>
              ) : socialSection === "Activity" ? (
                <>
                  <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Social activity</Text><Text style={styles.sectionMeta}>{socialNotifications.filter((item) => !item.read).length} UNREAD</Text></View>
                  <Text style={styles.pageIntro}>Reactions, comments, connection requests and messages are separate from store notifications.</Text>
                  {socialNotificationsLoading ? <ActivityIndicator color={accentColor} /> : socialNotifications.map((item) => (
                    <TouchableOpacity key={item.id} style={[styles.toolCard,!item.read && {backgroundColor:(accentColor + "18")}]} onPress={() => !item.read ? void markSocialNotificationRead(item) : undefined}>
                      <View style={styles.toolCopy}><Text style={styles.toolTitle}>{item.title || "Social activity"}</Text><Text style={styles.toolDescription}>{item.body || ""}</Text><Text style={styles.postTag}>{item.created_at ? new Date(item.created_at).toLocaleString() : ""}</Text></View>
                      <Text style={styles.chevron}>{item.read ? "✓" : "•"}</Text>
                    </TouchableOpacity>
                  ))}
                  {!socialNotificationsLoading && !socialNotifications.length ? <Text style={styles.emptyText}>No Social activity yet.</Text> : null}
                </>
              ) : socialSection === "Investors" ? (
                <>
                  <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Invest & Grow</Text><Text style={styles.sectionMeta}>OPPORTUNITIES</Text></View>
                  <Text style={styles.pageIntro}>Founders can describe a real opportunity; interested members can contact the founder. MAS does not process investments or guarantee offers.</Text>
                  <View style={styles.composeCard}>
                    <Text style={styles.fieldLabel}>Opportunity title *</Text>
                    <TextInput value={investmentTitle} onChangeText={(value) => setInvestmentTitle(value.slice(0,120))} placeholder="e.g. Local logistics platform" placeholderTextColor={COLORS.muted} style={styles.formInput}/>
                    <Text style={styles.fieldLabel}>Industry *</Text>
                    <TextInput value={investmentIndustry} onChangeText={(value) => setInvestmentIndustry(value.slice(0,80))} placeholder="Technology, agriculture…" placeholderTextColor={COLORS.muted} style={styles.formInput}/>
                    <Text style={styles.fieldLabel}>Stage</Text>
                    <View style={styles.chips}>{([["idea","Idea"],["prototype","Prototype"],["early_revenue","Early revenue"],["growth","Growth"],["established","Established"]] as [string,string][]).map(([value,label]) => <TouchableOpacity key={value} onPress={() => setInvestmentStage(value)} style={[styles.chip,investmentStage === value && [styles.chipActive,{borderColor:accentColor,backgroundColor:accentColor+"18"}]]}><Text style={[styles.chipText,investmentStage === value && [styles.chipTextActive,{color:accentColor}]]}>{label}</Text></TouchableOpacity>)}</View>
                    <Text style={styles.fieldLabel}>Funding goal (optional)</Text>
                    <TextInput value={investmentGoal} onChangeText={(value) => setInvestmentGoal(value.replace(/[^0-9.]/g,"").slice(0,18))} keyboardType="decimal-pad" placeholder="Amount requested" placeholderTextColor={COLORS.muted} style={styles.formInput}/>
                    <View style={styles.chips}>{(["MWK","USD","ZAR","GBP","EUR"]).map((value) => <TouchableOpacity key={value} onPress={() => setInvestmentCurrency(value)} style={[styles.chip,investmentCurrency === value && [styles.chipActive,{borderColor:accentColor,backgroundColor:accentColor+"18"}]]}><Text style={[styles.chipText,investmentCurrency === value && [styles.chipTextActive,{color:accentColor}]]}>{value}</Text></TouchableOpacity>)}</View>
                    <Text style={styles.fieldLabel}>Description *</Text>
                    <TextInput value={investmentDescription} onChangeText={(value) => setInvestmentDescription(value.slice(0,4000))} multiline maxLength={4000} placeholder="Explain the opportunity, traction and what support you need…" placeholderTextColor={COLORS.muted} style={[styles.formInput,{minHeight:100,textAlignVertical:"top"}]}/>
                    <Text style={styles.fieldLabel}>Use of funds</Text>
                    <TextInput value={investmentUse} onChangeText={(value) => setInvestmentUse(value.slice(0,1000))} multiline maxLength={1000} placeholder="How would the funds be used?" placeholderTextColor={COLORS.muted} style={[styles.formInput,{minHeight:70,textAlignVertical:"top"}]}/>
                    <TouchableOpacity disabled={investmentSaving} style={[[styles.primaryButton,{backgroundColor:accentColor}],investmentSaving && {opacity:0.5}]} onPress={() => void publishInvestmentOpportunity()}><Text style={styles.primaryButtonText}>{investmentSaving ? "Publishing…" : "Publish opportunity"}</Text></TouchableOpacity>
                  </View>
                  {investmentLoading ? <ActivityIndicator color={accentColor} /> : investmentOpportunities.map((item) => (
                    <View key={item.id} style={styles.toolCard}>
                      <View style={styles.toolCopy}>
                        <Text style={styles.toolTitle}>{item.title}</Text>
                        <Text style={styles.postTag}>{item.founderName} · {item.industry} · {String(item.stage).replace("_"," ")}</Text>
                        <Text style={styles.toolDescription}>{item.description}</Text>
                        {item.funding_goal ? <Text style={styles.postTag}>Goal: {item.currency} {Number(item.funding_goal).toLocaleString()}</Text> : null}
                        {item.use_of_funds ? <Text style={styles.postTag}>Use of funds: {item.use_of_funds}</Text> : null}
                        <Text style={styles.postTag}>Status: {item.status}</Text>
                      </View>
                      {item.isOwner ? <View style={{gap:8,alignItems:"flex-end"}}>{item.status === "open" ? <TouchableOpacity onPress={() => void changeInvestmentStatus(item,"paused")}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>Pause</Text></TouchableOpacity> : item.status === "paused" ? <TouchableOpacity onPress={() => void changeInvestmentStatus(item,"open")}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>Reopen</Text></TouchableOpacity> : null}{item.status !== "closed" ? <TouchableOpacity onPress={() => void changeInvestmentStatus(item,"closed")}><Text style={styles.removeMediaText}>Close</Text></TouchableOpacity> : null}</View> : <TouchableOpacity onPress={() => void openConversation(item.founder_id)}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>Contact founder</Text></TouchableOpacity>}
                    </View>
                  ))}
                  {!investmentLoading && !investmentOpportunities.length ? <Text style={styles.emptyText}>No open opportunities yet. Publish the first one.</Text> : null}
                </>
              ) : (
                <>
                  <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{socialSection}</Text><Text style={styles.sectionMeta}>{feedSource === "live" ? "MAS SOCIAL" : feedSource === "error" ? "LOAD FAILED" : isSupabaseConfigured ? "NO SOCIAL POSTS" : "BACKEND NOT CONFIGURED"}</Text></View>
                  <Text style={styles.pageIntro}>{socialSection === "Collabo" ? "Share what you are building, find teammates and connect with collaborators." : socialSection === "Grants" ? "Share grant announcements, funding calls and questions with the MAS community." : "Describe your project, funding goal and what supporters can help you achieve."}</Text>
                  <View style={styles.composeCard}>
                    <TextInput accessibilityLabel={"Write a " + socialSection + " post"} placeholder={socialSection === "Grants" ? "Grant name, eligibility, deadline or question…" : socialSection === "Crowdfund" ? "Project goal, amount needed and how funds will be used…" : "Project, skills needed and how people can collaborate…"} placeholderTextColor={COLORS.muted} value={sectionPostDraft} onChangeText={(value) => setSectionPostDraft(value.slice(0, 3000))} multiline maxLength={3000} style={styles.postComposerInput} />
                    <View style={styles.composeFooter}><Text style={styles.composeLimit}>{sectionPostDraft.length}/3000</Text><TouchableOpacity disabled={sectionPosting || sectionPostDraft.trim().length < 20} style={[[styles.composeButton,{backgroundColor:accentColor}], (sectionPosting || sectionPostDraft.trim().length < 20) && { opacity: 0.5 }]} onPress={() => void publishSocialSectionPost()}><Text style={styles.composeButtonText}>{sectionPosting ? "Publishing…" : "Publish to " + socialSection}</Text></TouchableOpacity></View>
                  </View>
                  {filteredSocialPosts.filter((post) => post.text.startsWith("[" + socialSection.toUpperCase() + "] ")).map((post) => (
                    <View key={post.id} style={styles.postCard}>
                      <View style={styles.postHeader}><View style={styles.smallAvatar}><Text style={styles.smallAvatarText}>{post.name.charAt(0).toUpperCase()}</Text></View><View style={styles.postIdentity}><Text style={styles.postName}>{post.name}</Text><Text style={styles.postTag}>{post.tag}</Text></View></View>
                      <Text style={styles.postText}>{post.text.slice(socialSection.length + 3)}</Text>
                      <View style={styles.postActions}><TouchableOpacity disabled={!post.authorId} onPress={() => post.authorId ? void requestConnection(post.authorId, post.id) : showNotice("This post has no member profile.")}><Text style={styles.postAction}>↗ Connect</Text></TouchableOpacity><TouchableOpacity disabled={!post.authorId} onPress={() => post.authorId ? void openConversation(post.authorId) : showNotice("This post has no member profile.")}><Text style={styles.postAction}>✉ Message</Text></TouchableOpacity></View>
                    </View>
                  ))}
                  {!filteredSocialPosts.some((post) => post.text.startsWith("[" + socialSection.toUpperCase() + "] ")) ? <Text style={styles.emptyText}>{socialSearchQuery.trim() ? "No posts match your search." : "No " + socialSection.toLowerCase() + " posts yet. Publish the first one for the community."}</Text> : null}
                  <Text style={styles.disclaimer}>MAS connects members but does not verify investment offers, guarantee grants, or process crowdfunding payments here. Never send money based only on a social post.</Text>
                </>
              )}
            </>
          )}

          {!selectedApp && utilityScreen === "none" && developerScreen === null && tab === "Develop" && (
            <>
              <Text style={styles.pageTitle}>Developer space</Text>
              <Text style={styles.pageIntro}>Manage listings, releases, reviews, analytics, team access, Spotlight applications and developer verification. Payment checkout and selected advanced tools hand off to the secure MAS web console.</Text>
              <View style={styles.developerStatus}><View style={styles.statusDot}/><Text style={styles.statusText}>Secure integration links enabled</Text></View>
              {[
                ["▣", "Developer dashboard", "Publishing readiness, installs, views and performance.", "https://malawian-app-store-j6pm.vercel.app/console"],
                ["＋", "Publish a product", "Create a new app, website or digital product.", "https://malawian-app-store-j6pm.vercel.app/upload"],
                ["▣", "My applications", "Manage listings, versions and release details.", "https://malawian-app-store-j6pm.vercel.app/console/products/"],
                ["↗", "Analytics", "Review product views, installs and conversion.", "https://malawian-app-store-j6pm.vercel.app/console/analytics"],
                ["✓", "Publishing checklist", "Check store readiness and publishing requirements.", "https://malawian-app-store-j6pm.vercel.app/console/publishing"],
                ["◇", "Quality checks", "Review product quality and submission requirements.", "https://malawian-app-store-j6pm.vercel.app/console/quality"],
                ["★", "Reviews", "Read and manage customer feedback.", "https://malawian-app-store-j6pm.vercel.app/console/reviews"],
                ["▤", "Developer resources", "Guides and tools for building and publishing.", "https://malawian-app-store-j6pm.vercel.app/console/resources"],
                ["▷", "Testing", "Open product testing and release tools.", "https://malawian-app-store-j6pm.vercel.app/console/testing"],
                ["✓", "Developer verification", "Start or review identity verification.", "https://malawian-app-store-j6pm.vercel.app/console/verification"],
                ["◇", "Developer Pro", "Manage subscription and PayChangu checkout.", "https://malawian-app-store-j6pm.vercel.app/console/subscription"],
                ["↗", "Collaboration & funding", "Open collaboration, investor, grant and crowdfunding tools.", "https://malawian-app-store-j6pm.vercel.app/console/social"],
                ["▤", "Developer wallet", "View wallet and earnings information.", "https://malawian-app-store-j6pm.vercel.app/console/wallet"],
                ["⚙", "Console settings", "Manage developer console preferences.", "https://malawian-app-store-j6pm.vercel.app/console/settings"],
                ["⌑", "Security", "Review account security settings.", "https://malawian-app-store-j6pm.vercel.app/console/security"],
                ["▦", "Store management", "Open store and product management tools.", "https://malawian-app-store-j6pm.vercel.app/console/store"],
                ["✦", "Developer assistant", "Get help with developer workflows.", "https://malawian-app-store-j6pm.vercel.app/console/assistant"],
                ["◎", "Team management", "Manage your developer team.", "https://malawian-app-store-j6pm.vercel.app/team"],
                ["↗", "Promote a product", "Explore advertising and product promotion.", "https://malawian-app-store-j6pm.vercel.app/advertise"],
                ["✦", "Spotlight", "Explore featured visibility opportunities.", "https://malawian-app-store-j6pm.vercel.app/spotlight"],
                ["♧", "My public profile", "View and update your public MAS profile.", "https://malawian-app-store-j6pm.vercel.app/profile"],
              ].map(([icon, title, description, url]) => (
                <TouchableOpacity key={title} style={styles.toolCard} accessibilityRole="link" onPress={() => { if (title === "Collaboration & funding") { setSocialSection("Collabo"); setDeveloperScreen(null); setTab("Social"); } else if (title === "Developer resources") setDeveloperScreen("Developer resources"); else if (title === "Store management") setDeveloperScreen("My applications"); else if (["Developer assistant", "Promote a product", "Security"].includes(title)) setDeveloperScreen(title); else if (title === "Developer wallet") setDeveloperScreen("Developer wallet"); else if (title === "Console settings") setDeveloperScreen("Console settings"); else if (title === "Developer verification") setDeveloperScreen("Verification"); else if (title === "Developer Pro") setDeveloperScreen("Developer Pro"); else if (["Developer dashboard", "Publish a product", "My applications", "Analytics", "Reviews", "Publishing checklist", ...Object.keys(nativeDeveloperPreviews)].includes(title)) setDeveloperScreen(title); else void Linking.openURL(url).catch(() => showNotice("Could not open the MAS web console. Please check your connection and try again.")); }}>
                  <View style={[styles.toolIcon,{backgroundColor:accentColor+"18"}]}><NativeIcon name={icon as any} color={accentColor} size={21} /></View>
                  <View style={styles.toolCopy}><Text style={styles.toolTitle}>{title}</Text><Text style={styles.toolDescription}>{description}</Text></View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              ))}
              <Text style={styles.disclaimer}>Security note: payment and identity-provider secrets stay on the MAS server. These links hand off to the existing web workflows; they do not claim that PayChangu or Didit checkout runs natively inside this app.</Text>
            </>
          )}

          {!selectedApp && utilityScreen === "none" && developerScreen === null && tab === "Profile" && (
            <>
              <Text style={styles.pageTitle}>Your MAS profile</Text>
              <Text style={styles.pageIntro}>Your account, apps and community activity in one place.</Text>
              <View style={styles.profileCard}>{accountAvatarUri ? <Image source={{ uri: accountAvatarUri }} style={[styles.profileAvatar,{backgroundColor:accentColor}]} resizeMode="cover" /> : <View style={[styles.profileAvatar,{backgroundColor:accentColor}]}><Text style={styles.profileAvatarText}>{(accountDisplayName || userEmail || "V").charAt(0).toUpperCase()}</Text></View>}<Text style={styles.profileName}>{accountDisplayName || (userEmail ? "You're signed in" : "Your MAS account")}</Text><Text style={styles.profileHint}>{userEmail || (isSupabaseConfigured ? "Sign in or create an account to connect your MAS profile." : "Account sign-in needs the MAS backend configuration in this build.")}</Text>
                {userEmail ? (
                  <TouchableOpacity style={[[styles.primaryButton,{backgroundColor:accentColor}], { backgroundColor: accentColor }]} onPress={() => { void supabase.auth.signOut().then(({ error }) => { if (error) showNotice(error.message); else { setUserEmail(null); showNotice("Signed out."); } }); }}>
                    <Text style={styles.primaryButtonText}>Sign out</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.authForm}>
                    <View style={styles.authModeRow}>
                      <TouchableOpacity onPress={() => setAuthMode("signin")} style={[styles.authModeButton, authMode === "signin" && { borderColor: accentColor, backgroundColor: `${accentColor}18` }]}>
                        <Text style={[styles.authModeText, authMode === "signin" && { color: accentColor }]}>Sign in</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setAuthMode("signup")} style={[styles.authModeButton, authMode === "signup" && { borderColor: accentColor, backgroundColor: `${accentColor}18` }]}>
                        <Text style={[styles.authModeText, authMode === "signup" && { color: accentColor }]}>Create account</Text>
                      </TouchableOpacity>
                    </View>
                    <TextInput accessibilityLabel="Email address" value={authEmail} onChangeText={setAuthEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" placeholder="Email address" placeholderTextColor={COLORS.muted} style={styles.formInput} />
                    <TextInput accessibilityLabel="Password" value={authPassword} onChangeText={setAuthPassword} secureTextEntry textContentType={authMode === "signup" ? "newPassword" : "password"} autoCapitalize="none" placeholder="Password (at least 6 characters)" placeholderTextColor={COLORS.muted} style={styles.formInput} />
                    <TouchableOpacity disabled={!isSupabaseConfigured || authLoading} style={[[styles.primaryButton,{backgroundColor:accentColor}], { backgroundColor: accentColor }, (!isSupabaseConfigured || authLoading) && { opacity: 0.55 }]} onPress={() => void handleEmailAuth()}>
                      <Text style={styles.primaryButtonText}>{authLoading ? "Please wait…" : authMode === "signup" ? "Create account" : "Sign in with email"}</Text>
                    </TouchableOpacity>
                    <Text style={styles.authDivider}>OR</Text>
                    <TouchableOpacity disabled={!isSupabaseConfigured || authLoading} style={[styles.secondaryButton, { alignSelf: "stretch", alignItems: "center" }]} onPress={async () => {
                      if (!isSupabaseConfigured) return;
                      setAuthLoading(true);
                      const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: "mw.wealthgrid.mas://auth/callback", skipBrowserRedirect: true } });
                      if (error) { showNotice(error.message); setAuthLoading(false); return; }
                      if (data.url) { try { await Linking.openURL(data.url); } catch { showNotice("Could not open Google sign-in."); setAuthLoading(false); } }
                      else { showNotice("Google sign-in URL was not returned."); setAuthLoading(false); }
                    }}>
                      <Text style={[[styles.secondaryButtonText,{color:accentColor}], { color: accentColor }]}>{authLoading ? "Connecting…" : "Continue with Google"}</Text>
                    </TouchableOpacity>
                  </View>
                )}</View>
              <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>More of MAS</Text><Text style={styles.sectionMeta}>QUICK ACCESS</Text></View>
              {[
                ["book", "My library", "Your saved apps and library.", "native:library"],
                ["bell", "Notifications", "Account and platform alerts.", "native:notifications"],
                ["settings", "Account settings", "Manage your account preferences.", "native:settings"],
                ["users", "Social community", "Explore posts, messages and collaboration.", "native:social"],
                ["grid", "Developer space", "Publish and manage your products.", "native:develop"],
                ["↗", "Open MAS website", "Access every web feature and console page.", "https://malawian-app-store-j6pm.vercel.app/"],
              ].map(([icon, title, description, url]) => (
                <TouchableOpacity key={title} style={styles.toolCard} accessibilityRole="link" onPress={() => { if (url === "native:library") setUtilityScreen("library"); else if (url === "native:notifications") setUtilityScreen("notifications"); else if (url === "native:settings") setUtilityScreen("settings"); else if (url === "native:social") { setUtilityScreen("none"); setDeveloperScreen(null); setTab("Social"); } else if (url === "native:develop") { setUtilityScreen("none"); setDeveloperScreen(null); setTab("Develop"); } else void Linking.openURL(url).catch(() => showNotice("Could not open this MAS page. Check your connection and try again.")); }}>
                  <View style={[styles.toolIcon,{backgroundColor:accentColor+"18"}]}><Text style={[styles.toolIconText,{color:accentColor}]}>{icon}</Text></View>
                  <View style={styles.toolCopy}><Text style={styles.toolTitle}>{title}</Text><Text style={styles.toolDescription}>{description}</Text></View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              ))}
              <View style={styles.infoBanner}><Text style={styles.infoTitle}>Built for Malawi</Text><Text style={styles.infoText}>Discover apps, collaborate with builders and grow local technology.</Text></View>
            </>
          )}
          {!selectedApp && utilityScreen !== "none" ? (
            <>
              <TouchableOpacity accessibilityRole="button" style={styles.secondaryButton} onPress={() => setUtilityScreen("none")}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>← Back</Text></TouchableOpacity>
              <Text style={styles.pageTitle}>{utilityScreen === "library" ? "My library" : utilityScreen === "notifications" ? "Notifications" : "Account settings"}</Text>
              <Text style={styles.pageIntro}>{utilityScreen === "library" ? "Your saved listings and installed-app history." : utilityScreen === "notifications" ? "Updates for your MAS account and activity." : "Manage your MAS account on this device."}</Text>
              {utilityScreen === "settings" ? (
                <View style={styles.composeCard}>
                  <Text style={styles.sectionTitle}>Appearance</Text>
                  <Text style={styles.toolDescription}>Choose the accent color used across the native MAS interface. Your choice is saved on this device.</Text>
                  <View style={styles.accentGrid}>
                    {[
                      { name: "Green", value: "#168447" },
                      { name: "Blue", value: "#2563EB" },
                      { name: "Red", value: "#DC2626" },
                      { name: "Orange", value: "#EA580C" },
                      { name: "Purple", value: "#9333EA" },
                      { name: "Black", value: "#171717" },
                      { name: "Teal", value: "#0F766E" },
                      { name: "Pink", value: "#DB2777" },
                    ].map((preset) => (
                      <TouchableOpacity key={preset.value} accessibilityRole="button" accessibilityState={{ selected: accentColor.toLowerCase() === preset.value.toLowerCase() }} onPress={() => setAccentColor(preset.value)} style={[styles.accentChoice, accentColor.toLowerCase() === preset.value.toLowerCase() && { borderColor: preset.value, backgroundColor: `${preset.value}12` }]}>
                        <View style={[styles.accentSwatch, { backgroundColor: preset.value }]} />
                        <Text style={styles.accentChoiceText}>{preset.name}</Text>
                        {accentColor.toLowerCase() === preset.value.toLowerCase() ? <Text style={[styles.accentCheck, { color: preset.value }]}>✓</Text> : null}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}
              {utilityScreen === "library" ? (
                <>
                  <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Saved listings</Text><Text style={styles.sectionMeta}>{libraryData.saved.length}</Text></View>
                  {utilityLoading ? <ActivityIndicator color={accentColor} /> : libraryData.saved.map((entry, index) => <View key={entry.listing_id || index} style={styles.toolCard}><TouchableOpacity style={styles.toolCopy} onPress={() => { const l = entry.listings; if (l) { setSelectedApp({ id: l.id, name: l.name, category: l.category || "Other", description: l.description || "", mark: (l.name || "M").slice(0,1), color: accentColor, slug: l.slug, kind: l.kind }); setUtilityScreen("none"); } }}><Text style={styles.toolTitle}>{entry.listings?.name || "Saved listing"}</Text><Text style={styles.toolDescription}>{entry.listings?.category || "MAS Store listing"}</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" onPress={async () => { if (!isSupabaseConfigured) { showNotice("Library actions need the MAS backend configuration."); return; } const { data: authData, error: authError } = await supabase.auth.getUser(); if (authError || !authData.user) { showNotice("Sign in to manage your library."); return; } const { error } = await supabase.from("wishlist").delete().eq("user_id", authData.user.id).eq("listing_id", entry.listing_id); if (error) { showNotice(error.message || "Could not remove this saved listing."); return; } setLibraryData((current) => ({ ...current, saved: current.saved.filter((item) => item.listing_id !== entry.listing_id) })); showNotice("Removed from your library."); }}><Text style={styles.removeMediaText}>Remove</Text></TouchableOpacity></View>)}
                  {!utilityLoading && !libraryData.saved.length ? <Text style={styles.emptyText}>You have no saved listings yet.</Text> : null}
                  <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Installed apps</Text><Text style={styles.sectionMeta}>{libraryData.installed.length}</Text></View>
                  {libraryData.installed.map((entry, index) => <View key={entry.id || index} style={styles.toolCard}><View style={styles.toolCopy}><Text style={styles.toolTitle}>{entry.listings?.name || "Installed listing"}</Text><Text style={styles.toolDescription}>Added {entry.installed_at ? new Date(entry.installed_at).toLocaleDateString() : "to your library"}</Text></View></View>)}
                  {!utilityLoading && !libraryData.installed.length ? <Text style={styles.emptyText}>Your installed-app list is empty.</Text> : null}
                  {!isSupabaseConfigured ? <Text style={styles.disclaimer}>Library data needs the public MAS backend configuration.</Text> : null}
                </>
              ) : utilityScreen === "notifications" ? (
                <>
                  <TouchableOpacity style={styles.secondaryButton} onPress={async () => { if (!isSupabaseConfigured) { showNotice("Notifications need the MAS backend configuration."); return; } const { data, error: authError } = await supabase.auth.getUser(); if (authError || !data.user) { showNotice("Sign in to manage notifications."); return; } const { error } = await supabase.from("notifications").update({ read: true }).eq("user_id", data.user.id).eq("read", false); if (error) showNotice("Could not mark notifications as read."); else { setNotificationItems((items) => items.map((item) => ({ ...item, read: true }))); showNotice("All notifications marked as read."); } }}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>Mark all as read</Text></TouchableOpacity>
                  {utilityLoading ? <ActivityIndicator color={accentColor} /> : notificationItems.map((item) => <View key={item.id} style={[styles.toolCard, !item.read && { backgroundColor: (accentColor + "18") }]}><View style={styles.toolCopy}><Text style={styles.toolTitle}>{item.title || "MAS notification"}</Text><Text style={styles.toolDescription}>{item.body || "Platform update"}</Text><Text style={styles.postTag}>{item.created_at ? new Date(item.created_at).toLocaleString() : ""}</Text></View>{!item.read ? <TouchableOpacity accessibilityRole="button" onPress={async () => { if (!isSupabaseConfigured) { showNotice("Notifications need the MAS backend configuration."); return; } const { data, error: authError } = await supabase.auth.getUser(); if (authError || !data.user) { showNotice("Sign in to manage notifications."); return; } const { error } = await supabase.from("notifications").update({ read: true }).eq("id", item.id).eq("user_id", data.user.id); if (error) showNotice(error.message || "Could not update this notification."); else { setNotificationItems((items) => items.map((current) => current.id === item.id ? { ...current, read: true } : current)); showNotice("Notification marked as read."); } }}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>Mark read</Text></TouchableOpacity> : <Text style={styles.chevron}>✓</Text>}</View>)}
                  {!utilityLoading && !notificationItems.length ? <Text style={styles.emptyText}>You have no notifications yet.</Text> : null}
                  {!isSupabaseConfigured ? <Text style={styles.disclaimer}>Notifications need the public MAS backend configuration.</Text> : null}
                </>
              ) : (
                <>
                  {utilityLoading ? <ActivityIndicator color={accentColor} /> : isSupabaseConfigured ? (
                    <View style={styles.composeCard}>
                      <View style={styles.profileCard}>{accountAvatarUri ? <Image source={{ uri: accountAvatarUri }} style={[styles.profileAvatar,{backgroundColor:accentColor}]} resizeMode="cover" /> : <View style={[styles.profileAvatar,{backgroundColor:accentColor}]}><Text style={styles.profileAvatarText}>{(accountDisplayName || userEmail || "V").charAt(0).toUpperCase()}</Text></View>}<Text style={styles.profileName}>{accountDisplayName || userEmail || "Your MAS account"}</Text><Text style={styles.profileHint}>Update the name and details shown on your MAS profile.</Text><TouchableOpacity style={styles.secondaryButton} onPress={() => void chooseAccountAvatar()}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>Change profile photo</Text></TouchableOpacity></View>
                      <Text style={styles.fieldLabel}>Display name (max 80 characters)</Text><TextInput value={accountDisplayName} onChangeText={(value) => setAccountDisplayName(value.slice(0,80))} placeholder="Your name" placeholderTextColor={COLORS.muted} style={styles.formInput} />
                      <Text style={styles.fieldLabel}>Developer name (max 100 characters)</Text><TextInput value={accountDeveloperName} onChangeText={(value) => setAccountDeveloperName(value.slice(0,100))} placeholder="Your developer or studio name" placeholderTextColor={COLORS.muted} style={styles.formInput} />
                      <Text style={styles.fieldLabel}>Bio (max 300 characters)</Text><TextInput value={accountBio} onChangeText={(value) => setAccountBio(value.slice(0,300))} placeholder="A short introduction" placeholderTextColor={COLORS.muted} multiline maxLength={300} style={[styles.formInput,{minHeight:100,textAlignVertical:"top"}]} />
                      <Text style={styles.fieldLabel}>Company / studio</Text><TextInput value={accountCompanyName} onChangeText={(value) => setAccountCompanyName(value.slice(0,120))} placeholder="Company or studio name" placeholderTextColor={COLORS.muted} style={styles.formInput} />
                      <Text style={styles.fieldLabel}>Location</Text><TextInput value={accountLocation} onChangeText={(value) => setAccountLocation(value.slice(0,120))} placeholder="City, country" placeholderTextColor={COLORS.muted} style={styles.formInput} />
                      <Text style={styles.fieldLabel}>Contact email</Text><TextInput value={accountContactEmail} onChangeText={setAccountContactEmail} autoCapitalize="none" keyboardType="email-address" placeholder="contact@example.com" placeholderTextColor={COLORS.muted} style={styles.formInput} />
                      <Text style={styles.fieldLabel}>Skills (comma-separated)</Text><TextInput value={accountSkills} onChangeText={(value) => setAccountSkills(value.slice(0,800))} placeholder="React Native, design, backend" placeholderTextColor={COLORS.muted} style={styles.formInput} />
                      <Text style={styles.fieldLabel}>Website (HTTPS)</Text><TextInput value={accountWebsiteUrl} onChangeText={setAccountWebsiteUrl} autoCapitalize="none" keyboardType="url" placeholder="https://example.com" placeholderTextColor={COLORS.muted} style={styles.formInput} />
                      <Text style={styles.fieldLabel}>GitHub (HTTPS)</Text><TextInput value={accountGithubUrl} onChangeText={setAccountGithubUrl} autoCapitalize="none" keyboardType="url" placeholder="https://github.com/username" placeholderTextColor={COLORS.muted} style={styles.formInput} />
                      <Text style={styles.fieldLabel}>Portfolio (HTTPS)</Text><TextInput value={accountPortfolioUrl} onChangeText={setAccountPortfolioUrl} autoCapitalize="none" keyboardType="url" placeholder="https://portfolio.example" placeholderTextColor={COLORS.muted} style={styles.formInput} />
                      <Text style={styles.fieldLabel}>LinkedIn (HTTPS)</Text><TextInput value={accountLinkedinUrl} onChangeText={setAccountLinkedinUrl} autoCapitalize="none" keyboardType="url" placeholder="https://linkedin.com/in/username" placeholderTextColor={COLORS.muted} style={styles.formInput} />
                      <Text style={styles.fieldLabel}>Facebook (HTTPS)</Text><TextInput value={accountFacebookUrl} onChangeText={setAccountFacebookUrl} autoCapitalize="none" keyboardType="url" placeholder="https://facebook.com/username" placeholderTextColor={COLORS.muted} style={styles.formInput} />
                      <TouchableOpacity disabled={accountProfileSaving} style={[[styles.primaryButton,{backgroundColor:accentColor}],accountProfileSaving && {opacity:0.5}]} onPress={() => void saveAccountProfile()}><Text style={styles.primaryButtonText}>{accountProfileSaving ? "Saving…" : "Save profile"}</Text></TouchableOpacity>
                      {userEmail ? <TouchableOpacity style={styles.secondaryButton} onPress={() => { void supabase.auth.signOut().then(({ error }) => { if (error) showNotice(error.message); else { setUserEmail(null); showNotice("Signed out."); setUtilityScreen("none"); } }); }}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>Sign out</Text></TouchableOpacity> : <TouchableOpacity style={[[styles.primaryButton,{backgroundColor:accentColor}], { backgroundColor: accentColor }]} onPress={() => { setUtilityScreen("none"); setTab("Profile"); }}><Text style={styles.primaryButtonText}>Go to sign in</Text></TouchableOpacity>}
                    </View>
                  ) : <Text style={styles.disclaimer}>Account settings are unavailable until the public MAS backend configuration is added to this build.</Text>}
                </>
              )}
            </>
          ) : null}
          {!selectedApp && utilityScreen === "none" && developerScreen !== null ? (
            <>
              <TouchableOpacity accessibilityRole="button" style={styles.secondaryButton} onPress={() => setDeveloperScreen(null)}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>← Back to developer space</Text></TouchableOpacity>
              <Text style={styles.pageTitle}>{developerScreen}</Text>
              <Text style={styles.pageIntro}>{developerScreen === "Developer dashboard" ? "A live overview of your products and publishing status." : developerScreen === "Publish a product" ? (editingListingId ? "Edit your product listing and save the changes." : "Create a native product draft. Complete the listing details and release assets before review.") : developerScreen === "My applications" ? "Manage products owned by your developer account." : developerScreen === "Analytics" ? "A summary of the listings currently attached to your developer account." : developerScreen === "Reviews" ? "Review feedback associated with your products." : "Check the readiness of your product drafts."}</Text>
              {developerScreen === "Publish a product" ? (
                <View style={styles.composeCard}>
                  {editingListingId ? <TouchableOpacity style={styles.secondaryButton} onPress={() => { setEditingListingId(null); setEditingListingStatus(null); setDraftName(""); setDraftTagline(""); setDraftDescription(""); setDraftWebsiteUrl(""); setDraftIcon(null); setDraftBanner(null); setExistingBannerUrl(null); setDraftReleaseFile(null); setDraftScreenshots([]); setExistingScreenshots([]); setDraftKeywords(""); setDraftTags(""); setDraftVersion("1.0.0"); setDraftChangelog("First release"); }}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>Cancel editing</Text></TouchableOpacity> : null}
                  <Text style={styles.fieldLabel}>Product type</Text><View style={styles.storeTabs}><TouchableOpacity style={[styles.storeTab,draftKind === "app" && [styles.storeTabActive,{borderBottomColor:accentColor}]]} onPress={() => setDraftKind("app")}><Text style={[styles.storeTabText,draftKind === "app" && [styles.storeTabTextActive,{color:accentColor}]]}>Android app</Text></TouchableOpacity><TouchableOpacity style={[styles.storeTab,draftKind === "website" && [styles.storeTabActive,{borderBottomColor:accentColor}]]} onPress={() => setDraftKind("website")}><Text style={[styles.storeTabText,draftKind === "website" && [styles.storeTabTextActive,{color:accentColor}]]}>Website</Text></TouchableOpacity></View>
                  <Text style={styles.fieldLabel}>Product name *</Text><TextInput value={draftName} onChangeText={(value) => setDraftName(value.slice(0,100))} placeholder="e.g. Mlimi Connect" placeholderTextColor={COLORS.muted} style={styles.formInput} />
                  <Text style={styles.fieldLabel}>Short tagline</Text><TextInput value={draftTagline} onChangeText={(value) => setDraftTagline(value.slice(0,160))} placeholder="A short description" placeholderTextColor={COLORS.muted} style={styles.formInput} />
                  <Text style={styles.fieldLabel}>Category</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{["Business","Education","Entertainment","Finance","Health","News","Shopping","Social","Tools","Transport","Other"].map((item) => <TouchableOpacity key={item} onPress={() => setDraftCategory(item)} style={[styles.chip,draftCategory === item && [styles.chipActive,{borderColor:accentColor,backgroundColor:accentColor+"18"}]]}><Text style={[styles.chipText,draftCategory === item && [styles.chipTextActive,{color:accentColor}]]}>{item}</Text></TouchableOpacity>)}</ScrollView>
                  {draftKind === "website" ? <><Text style={styles.fieldLabel}>Website URL *</Text><TextInput value={draftWebsiteUrl} onChangeText={setDraftWebsiteUrl} autoCapitalize="none" keyboardType="url" placeholder="https://example.mw" placeholderTextColor={COLORS.muted} style={styles.formInput} /></> : <>
                    <Text style={styles.fieldLabel}>Android release file (APK or ZIP)</Text>
                    <TouchableOpacity accessibilityRole="button" style={styles.mediaAttachButton} onPress={() => void chooseDraftReleaseFile()}><Text style={styles.mediaAttachText}>{draftReleaseFile ? `Release selected · ${draftReleaseFile.name}` : "＋ Choose APK or ZIP release"}</Text></TouchableOpacity>
                    {draftReleaseFile ? <View style={styles.selectedMedia}><Text style={styles.selectedMediaText}>{draftReleaseFile.name}{draftReleaseFile.size ? ` · ${(draftReleaseFile.size / 1048576).toFixed(1)} MB` : ""}</Text><TouchableOpacity onPress={() => setDraftReleaseFile(null)}><Text style={styles.removeMediaText}>Remove</Text></TouchableOpacity></View> : null}
                    <Text style={styles.fieldLabel}>Version</Text><TextInput value={draftVersion} onChangeText={(value) => setDraftVersion(value.slice(0,40))} placeholder="1.0.0" placeholderTextColor={COLORS.muted} style={styles.formInput} />
                    <Text style={styles.fieldLabel}>Release notes</Text><TextInput value={draftChangelog} onChangeText={(value) => setDraftChangelog(value.slice(0,1000))} placeholder="What changed in this release?" placeholderTextColor={COLORS.muted} multiline style={[styles.formInput,{minHeight:80,textAlignVertical:"top"}]} />
                  </>}
                  <Text style={styles.fieldLabel}>Product icon</Text>
                  <TouchableOpacity accessibilityRole="button" style={styles.mediaAttachButton} onPress={() => void chooseDraftIcon()}><Text style={styles.mediaAttachText}>{draftIcon ? `Icon selected · ${draftIcon.fileName}` : "＋ Choose product icon"}</Text></TouchableOpacity>
                  <Text style={styles.fieldLabel}>Feature banner (16:9)</Text>
                  <TouchableOpacity accessibilityRole="button" style={styles.mediaAttachButton} onPress={() => void chooseDraftBanner()}><Text style={styles.mediaAttachText}>{draftBanner ? `Banner selected · ${draftBanner.fileName}` : existingBannerUrl ? "Replace existing feature banner" : "＋ Choose feature banner"}</Text></TouchableOpacity>
                  {draftBanner ? <View style={styles.selectedMedia}><Text style={styles.selectedMediaText}>{draftBanner.fileName}</Text><TouchableOpacity onPress={() => setDraftBanner(null)}><Text style={styles.removeMediaText}>Remove new banner</Text></TouchableOpacity></View> : existingBannerUrl ? <Text style={styles.postTag}>A feature banner is already uploaded.</Text> : null}
                  <Text style={styles.fieldLabel}>Listing screenshots (up to 8 total)</Text>
                  <TouchableOpacity accessibilityRole="button" style={styles.mediaAttachButton} onPress={() => void chooseDraftScreenshots()}><Text style={styles.mediaAttachText}>＋ Choose screenshots ({existingScreenshots.length + draftScreenshots.length}/8)</Text></TouchableOpacity>
                  {draftScreenshots.length ? <View style={styles.selectedMedia}><Text style={styles.selectedMediaText}>{draftScreenshots.map((item) => item.fileName).join(", ")}</Text><TouchableOpacity onPress={() => setDraftScreenshots([])}><Text style={styles.removeMediaText}>Clear new screenshots</Text></TouchableOpacity></View> : null}
                  <Text style={styles.fieldLabel}>Keywords (comma-separated, up to 12)</Text><TextInput value={draftKeywords} onChangeText={(value) => setDraftKeywords(value.slice(0,500))} placeholder="malawi, business, productivity" placeholderTextColor={COLORS.muted} style={styles.formInput} />
                  <Text style={styles.fieldLabel}>Tags (comma-separated, up to 8)</Text><TextInput value={draftTags} onChangeText={(value) => setDraftTags(value.slice(0,300))} placeholder="startup, local, useful" placeholderTextColor={COLORS.muted} style={styles.formInput} />
                  {draftIcon ? <View style={styles.selectedMedia}><Text style={styles.selectedMediaText}>{draftIcon.fileName}</Text><TouchableOpacity onPress={() => setDraftIcon(null)}><Text style={styles.removeMediaText}>Remove</Text></TouchableOpacity></View> : null}
                  <Text style={styles.fieldLabel}>Description *</Text><TextInput value={draftDescription} onChangeText={(value) => setDraftDescription(value.slice(0,4000))} multiline maxLength={4000} placeholder="What does your product do and who is it for?" placeholderTextColor={COLORS.muted} style={[styles.formInput,{minHeight:120,textAlignVertical:"top"}]} />
                  <TouchableOpacity disabled={draftSaving} style={[[styles.primaryButton,{backgroundColor:accentColor}],draftSaving && {opacity:0.5}]} onPress={() => void createNativeDraft()}><Text style={styles.primaryButtonText}>{draftSaving ? "Saving…" : editingListingId ? "Save listing changes" : "Save product draft"}</Text></TouchableOpacity>
                  <Text style={styles.disclaimer}>Saving creates or updates your draft. From My applications, complete the required assets and listing checks, then submit eligible drafts for review. Upload and submission errors are shown in the app.</Text>
                </View>
              ) : developerScreen === "Developer dashboard" ? (
                <>
                  {developerLoading ? <ActivityIndicator color={accentColor} /> : <View style={styles.devMetricGrid}>{[["Published",developerRows.filter((x) => x.status === "published").length],["In review",developerRows.filter((x) => x.status === "pending").length],["Drafts",developerRows.filter((x) => x.status === "draft").length],["Rejected",developerRows.filter((x) => x.status === "rejected").length]].map(([label,value]) => <View key={String(label)} style={styles.devMetric}><Text style={styles.devMetricValue}>{value}</Text><Text style={styles.devMetricLabel}>{label}</Text></View>)}</View>}
                  <TouchableOpacity style={[[styles.primaryButton,{backgroundColor:accentColor}], { backgroundColor: accentColor }]} onPress={() => setDeveloperScreen("Publish a product")}><Text style={styles.primaryButtonText}>＋ Publish a product</Text></TouchableOpacity><TouchableOpacity style={styles.secondaryButton} onPress={() => setDeveloperScreen("My applications")}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>View all products →</Text></TouchableOpacity>
                </>
              ) : developerScreen === "Reviews" ? (
                <>
                  {developerLoading ? <ActivityIndicator color={accentColor} /> : developerReviews.map((review) => <View key={review.id} style={styles.toolCard}><View style={styles.toolCopy}><Text style={styles.toolTitle}>{developerRows.find((row) => row.id === review.listing_id)?.name || "Product review"} · {Number(review.rating) || 0}/5 ★</Text><Text style={styles.toolDescription}>{review.body || "No written review."}</Text><Text style={styles.postTag}>{review.created_at ? new Date(review.created_at).toLocaleDateString() : ""}</Text>{review.developer_reply ? <View style={styles.infoBanner}><Text style={styles.infoTitle}>Your reply</Text><Text style={styles.infoText}>{review.developer_reply}</Text></View> : <><TextInput accessibilityLabel="Reply to product review" value={reviewReplies[review.id] ?? ""} onChangeText={(value) => setReviewReplies((items) => ({ ...items, [review.id]: value.slice(0, 1000) }))} placeholder="Write a reply to this review…" placeholderTextColor={COLORS.muted} style={styles.commentInput} multiline maxLength={1000} /><TouchableOpacity disabled={reviewReplySaving === review.id || !(reviewReplies[review.id] || "").trim()} style={[[styles.composeButton,{backgroundColor:accentColor}], { alignSelf: "flex-end", marginTop: 8 }, (reviewReplySaving === review.id || !(reviewReplies[review.id] || "").trim()) && { opacity: 0.5 }]} onPress={() => void replyToDeveloperReview(review)}><Text style={styles.composeButtonText}>{reviewReplySaving === review.id ? "Publishing…" : "Publish reply"}</Text></TouchableOpacity></>}</View></View>)}
                  {!developerLoading && !developerReviews.length ? <Text style={styles.emptyText}>No reviews have been posted for your products yet.</Text> : null}
                </>
              ) : developerScreen === "Analytics" ? (
                <>
                  <View style={styles.infoBanner}><Text style={styles.infoTitle}>Product analytics</Text><Text style={styles.infoText}>Live view and install events for your listings. Conversion is installs divided by views; repeated events may be counted separately.</Text></View>
                  <View style={styles.chips}>{([["7d","7 days"],["30d","30 days"],["90d","90 days"]] as ["7d" | "30d" | "90d",string][]).map(([value,label]) => <TouchableOpacity key={value} onPress={() => setAnalyticsRange(value)} style={[styles.chip,analyticsRange === value && [styles.chipActive,{borderColor:accentColor,backgroundColor:accentColor+"18"}]]}><Text style={[styles.chipText,analyticsRange === value && [styles.chipTextActive,{color:accentColor}]]}>{label}</Text></TouchableOpacity>)}</View>
                  {analyticsLoading ? <ActivityIndicator color={accentColor}/> : !analyticsProAllowed ? (
                    <View style={styles.composeCard}>
                      <Text style={styles.sectionTitle}>Advanced analytics requires Developer Pro</Text>
                      <Text style={styles.toolDescription}>Your detailed view/install events and audience breakdowns are available while your Pro subscription is active or within its paid period.</Text>
                      <TouchableOpacity style={[[styles.primaryButton,{backgroundColor:accentColor}], { backgroundColor: accentColor }]} onPress={() => setDeveloperScreen("Developer Pro")}><Text style={styles.primaryButtonText}>View Developer Pro →</Text></TouchableOpacity>
                    </View>
                  ) : <>
                    <View style={styles.devMetricGrid}>
                      {[["Views",analyticsStats.views],["Installs",analyticsStats.installs],["Conversion",analyticsStats.views ? Math.round(analyticsStats.installs / analyticsStats.views * 100) + "%" : "—"],["Products",developerRows.length]].map(([label,value]) => <View key={String(label)} style={styles.devMetric}><Text style={styles.devMetricValue}>{String(value)}</Text><Text style={styles.devMetricLabel}>{String(label)}</Text></View>)}
                    </View>
                    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Performance by product</Text><Text style={styles.sectionMeta}>{analyticsRange}</Text></View>
                    {developerRows.map((item) => {
                      const metrics = analyticsStats.byListing[item.id] || { views: 0, installs: 0 };
                      const conversion = metrics.views ? Math.round(metrics.installs / metrics.views * 100) : 0;
                      return <View key={item.id} style={styles.toolCard}><View style={styles.toolCopy}><Text style={styles.toolTitle}>{item.name}</Text><Text style={styles.toolDescription}>{metrics.views} views · {metrics.installs} installs · {metrics.views ? conversion + "% conversion" : "No views in this period"}</Text><Text style={styles.postTag}>Lifetime: {item.downloads ?? 0} installs · {(item.rating_count ?? 0) > 0 ? Number(item.rating_avg).toFixed(1) + " ★" : "No ratings"}</Text></View></View>;
                    })}
                    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Audience devices</Text></View>
                    {Object.entries(analyticsStats.viewsByDevice).sort((a,b) => b[1]-a[1]).slice(0,5).map(([device,count]) => <View key={device} style={styles.toolCard}><View style={styles.toolCopy}><Text style={styles.toolTitle}>{device}</Text><Text style={styles.toolDescription}>{count} views · {(analyticsStats.installsByDevice[device] || 0)} installs</Text></View></View>)}
                    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Audience countries</Text></View>
                    {Object.entries(analyticsStats.viewsByCountry).sort((a,b) => b[1]-a[1]).slice(0,5).map(([country,count]) => <View key={country} style={styles.toolCard}><View style={styles.toolCopy}><Text style={styles.toolTitle}>{country}</Text><Text style={styles.toolDescription}>{count} views · {(analyticsStats.installsByCountry[country] || 0)} installs</Text></View></View>)}
                    {!developerRows.length ? <Text style={styles.emptyText}>Publish a product to begin collecting analytics.</Text> : null}
                    {!analyticsStats.views && !analyticsStats.installs && developerRows.length ? <Text style={styles.emptyText}>No tracked events in this period yet.</Text> : null}
                  </>}
                </>
              ) : developerScreen === "My applications" || developerScreen === "Publishing checklist" ? (                <>
                  {developerLoading ? <ActivityIndicator color={accentColor} /> : developerRows.map((item) => <View key={item.id} style={styles.toolCard}><TouchableOpacity style={styles.toolCopy} onPress={() => developerScreen === "My applications" && item.status !== "pending" ? startEditingListing(item) : undefined}><Text style={styles.toolTitle}>{item.name}</Text><Text style={styles.toolDescription}>{item.category} · {item.kind} · {item.status}</Text>{developerScreen === "Publishing checklist" ? <Text style={styles.postTag}>{item.status === "published" ? "Published" : item.status === "draft" ? "Draft needs assets and checks" : item.status === "pending" ? "Awaiting review" : "Review status: " + item.status}</Text> : null}{developerScreen === "My applications" && item.status !== "pending" ? <Text style={styles.postTag}>Tap to edit listing</Text> : null}</TouchableOpacity>{developerScreen === "My applications" && (item.status === "draft" || item.status === "rejected") ? <View style={{ gap: 8, alignItems: "flex-end" }}><TouchableOpacity accessibilityRole="button" onPress={() => void submitDraftForReview(item)}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>Submit for review</Text></TouchableOpacity>{item.status === "draft" ? <TouchableOpacity accessibilityRole="button" onPress={() => void deleteNativeDraft(item)}><Text style={styles.removeMediaText}>Delete</Text></TouchableOpacity> : null}</View> : null}</View>)}
                  {!developerLoading && !developerRows.length ? <Text style={styles.emptyText}>No products are attached to this developer account yet.</Text> : null}
                  {developerScreen === "My applications" ? <TouchableOpacity style={[[styles.primaryButton,{backgroundColor:accentColor}], { backgroundColor: accentColor }]} onPress={() => setDeveloperScreen("Publish a product")}><Text style={styles.primaryButtonText}>＋ New product draft</Text></TouchableOpacity> : null}
                </>
              ) : null}
              {developerScreen === "My public profile" ? (
                <>
                  <View style={styles.profileCard}><View style={[styles.profileAvatar,{backgroundColor:accentColor}]}><Text style={styles.profileAvatarText}>{String(developerProfileInfo?.developer_name || developerProfileInfo?.display_name || userEmail || "M").charAt(0).toUpperCase()}</Text></View><Text style={styles.profileName}>{developerProfileInfo?.developer_name || developerProfileInfo?.display_name || "MAS developer"}</Text><Text style={styles.profileHint}>{developerProfileInfo?.bio || "Add a short bio in account settings to introduce yourself to the MAS community."}</Text>{developerProfileInfo?.website_url ? <TouchableOpacity style={styles.secondaryButton} onPress={() => void Linking.openURL(developerProfileInfo.website_url)}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>Open website</Text></TouchableOpacity> : null}<TouchableOpacity style={[[styles.primaryButton,{backgroundColor:accentColor}], { backgroundColor: accentColor }]} onPress={() => { setDeveloperScreen(null); setUtilityScreen("settings"); }}><Text style={styles.primaryButtonText}>Edit profile</Text></TouchableOpacity><TouchableOpacity style={styles.secondaryButton} onPress={() => { setDeveloperScreen(null); setTab("Social"); }}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>Open Social</Text></TouchableOpacity></View>
                  <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Portfolio projects</Text><Text style={styles.sectionMeta}>{portfolioProjects.length}</Text></View>
                  <View style={styles.composeCard}>
                    <Text style={styles.fieldLabel}>Project name *</Text>
                    <TextInput value={portfolioTitle} onChangeText={(value) => setPortfolioTitle(value.slice(0,100))} placeholder="Project or product name" placeholderTextColor={COLORS.muted} style={styles.formInput}/>
                    <Text style={styles.fieldLabel}>Project type</Text>
                    <View style={styles.chips}>{([["app","App"],["website","Website"],["game","Game"],["tool","Tool"],["other","Other"]] as [string,string][]).map(([value,label]) => <TouchableOpacity key={value} onPress={() => setPortfolioType(value)} style={[styles.chip,portfolioType === value && [styles.chipActive,{borderColor:accentColor,backgroundColor:accentColor+"18"}]]}><Text style={[styles.chipText,portfolioType === value && [styles.chipTextActive,{color:accentColor}]]}>{label}</Text></TouchableOpacity>)}</View>
                    <Text style={styles.fieldLabel}>HTTPS URL *</Text>
                    <TextInput value={portfolioUrl} onChangeText={(value) => setPortfolioUrl(value.slice(0,1000))} autoCapitalize="none" keyboardType="url" placeholder="https://example.mw" placeholderTextColor={COLORS.muted} style={styles.formInput}/>
                    <Text style={styles.fieldLabel}>Short description</Text>
                    <TextInput value={portfolioDescription} onChangeText={(value) => setPortfolioDescription(value.slice(0,500))} multiline maxLength={500} placeholder="What did you build?" placeholderTextColor={COLORS.muted} style={[styles.formInput,{minHeight:70,textAlignVertical:"top"}]}/>
                    <TouchableOpacity disabled={portfolioSaving} style={[[styles.primaryButton,{backgroundColor:accentColor}],portfolioSaving && {opacity:0.5}]} onPress={() => void addPortfolioProject()}><Text style={styles.primaryButtonText}>{portfolioSaving ? "Adding…" : "Add portfolio project"}</Text></TouchableOpacity>
                  </View>
                  {portfolioLoading ? <ActivityIndicator color={accentColor}/> : portfolioProjects.map((project) => <View key={project.id} style={styles.toolCard}><TouchableOpacity style={styles.toolCopy} onPress={() => void Linking.openURL(project.url).catch(() => showNotice("Could not open this portfolio link."))}><Text style={styles.toolTitle}>{project.title}</Text><Text style={styles.toolDescription}>{project.description || project.project_type}</Text><Text style={styles.postTag}>{project.project_type} · {project.url}</Text></TouchableOpacity><TouchableOpacity onPress={() => void removePortfolioProject(project)}><Text style={styles.removeMediaText}>Remove</Text></TouchableOpacity></View>)}
                  {!portfolioLoading && !portfolioProjects.length ? <Text style={styles.emptyText}>Add projects built outside MAS to showcase your work.</Text> : null}
                  <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Published products</Text><Text style={styles.sectionMeta}>{developerRows.filter((item) => item.status === "published").length}</Text></View>
                  {developerLoading ? <ActivityIndicator color={accentColor} /> : developerRows.filter((item) => item.status === "published").map((item) => <TouchableOpacity key={item.id} style={styles.toolCard} onPress={() => { setDeveloperScreen(null); setTab("Explore"); const match = apps.find((app) => app.id === item.id); if (match) setSelectedApp(match); else showNotice("This listing is not currently visible in the public catalogue."); }}><View style={styles.toolCopy}><Text style={styles.toolTitle}>{item.name}</Text><Text style={styles.toolDescription}>{item.tagline || item.description || item.category}</Text></View><Text style={styles.chevron}>›</Text></TouchableOpacity>)}
                  {!developerLoading && !developerRows.some((item) => item.status === "published") ? <Text style={styles.emptyText}>Published products will appear on your profile when they are approved.</Text> : null}
                </>
              ) : developerScreen === "Quality checks" ? (
                <>
                  <View style={styles.infoBanner}><Text style={styles.infoTitle}>Store readiness</Text><Text style={styles.infoText}>The checklist mirrors MAS store-quality requirements. Scores are guidance; a strong score does not guarantee approval.</Text></View>
                  {developerLoading ? <ActivityIndicator color={accentColor} /> : developerRows.map((item) => {
                    const report = asoReport(item);
                    return <View key={item.id} style={styles.toolCard}><View style={styles.toolCopy}><Text style={styles.toolTitle}>{item.name} · {report.score}/100</Text><Text style={styles.toolDescription}>{item.status === "published" ? "Published listing" : `Status: ${item.status}`}</Text>{report.checks.map((check) => <Text key={check.label} style={[styles.postTag, { color: check.ok ? COLORS.green : "#B42318" }]}>{check.ok ? "✓" : "Fix"} · {check.label}</Text>)}</View>{item.status !== "pending" ? <TouchableOpacity accessibilityRole="button" onPress={() => startEditingListing(item)}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>Edit listing</Text></TouchableOpacity> : null}</View>;
                  })}
                  {!developerLoading && !developerRows.length ? <Text style={styles.emptyText}>No listings to check yet. Create a product draft first.</Text> : null}
                </>
              ) : developerScreen === "Testing" ? (
                <>
                  <View style={styles.infoBanner}><Text style={styles.infoTitle}>Release testing workspace</Text><Text style={styles.infoText}>Manage tester lists and triage submitted feedback. Email delivery and private release distribution remain separate integration tasks.</Text></View>
                  <View style={styles.composeCard}>
                    <Text style={styles.fieldLabel}>Product to test *</Text>
                    <View style={styles.chips}>{developerRows.map((listing) => <TouchableOpacity key={listing.id} onPress={() => setBetaListingId(listing.id)} style={[styles.chip,betaListingId === listing.id && [styles.chipActive,{borderColor:accentColor,backgroundColor:accentColor+"18"}]]}><Text style={[styles.chipText,betaListingId === listing.id && [styles.chipTextActive,{color:accentColor}]]}>{listing.name}</Text></TouchableOpacity>)}</View>
                    {!developerRows.length ? <Text style={styles.emptyText}>Create a product listing before adding testers.</Text> : null}
                    <Text style={styles.fieldLabel}>Tester email</Text>
                    <TextInput value={betaTesterEmail} onChangeText={(value) => setBetaTesterEmail(value.slice(0,255))} autoCapitalize="none" keyboardType="email-address" placeholder="tester@example.mw" placeholderTextColor={COLORS.muted} style={styles.formInput}/>
                    <Text style={styles.fieldLabel}>Test channel</Text>
                    <View style={styles.chips}>{(["private","public"]).map((value) => <TouchableOpacity key={value} onPress={() => setBetaChannel(value)} style={[styles.chip,betaChannel === value && [styles.chipActive,{borderColor:accentColor,backgroundColor:accentColor+"18"}]]}><Text style={[styles.chipText,betaChannel === value && [styles.chipTextActive,{color:accentColor}]]}>{value === "private" ? "Private test" : "Public test"}</Text></TouchableOpacity>)}</View>
                    <TouchableOpacity disabled={betaSaving || !developerRows.length} style={[[styles.primaryButton,{backgroundColor:accentColor}],(betaSaving || !developerRows.length) && {opacity:0.5}]} onPress={() => void addBetaTester()}><Text style={styles.primaryButtonText}>{betaSaving ? "Adding tester…" : "Add tester"}</Text></TouchableOpacity>
                  </View>
                  <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Tester list</Text><Text style={styles.sectionMeta}>{betaTesters.length}</Text></View>
                  {betaLoading ? <ActivityIndicator color={accentColor}/> : betaTesters.map((tester) => <View key={tester.id} style={styles.toolCard}><View style={styles.toolCopy}><Text style={styles.toolTitle}>{tester.email}</Text><Text style={styles.toolDescription}>{developerRows.find((listing) => listing.id === tester.listing_id)?.name || "MAS product"} · {tester.channel} test</Text><Text style={styles.postTag}>{tester.status} · {tester.created_at ? new Date(tester.created_at).toLocaleDateString() : ""}</Text></View><TouchableOpacity onPress={async () => { const next = tester.status === "active" ? "invited" : "active"; const { error } = await supabase.from("beta_testers").update({status:next}).eq("id",tester.id); if (error) showNotice(error.message || "Could not update tester status."); else { setBetaTesters((items) => items.map((item) => item.id === tester.id ? {...item,status:next} : item)); showNotice("Tester status updated."); } }}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>{tester.status === "active" ? "Set invited" : "Mark active"}</Text></TouchableOpacity></View>)}
                  {!betaLoading && !betaTesters.length ? <Text style={styles.emptyText}>No beta testers have been added yet.</Text> : null}
                  <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Tester feedback</Text><Text style={styles.sectionMeta}>{betaFeedback.length}</Text></View>
                  {betaFeedback.map((feedback) => <View key={feedback.id} style={styles.toolCard}><View style={styles.toolCopy}><Text style={styles.toolTitle}>{feedback.kind} · {feedback.severity}</Text><Text style={styles.toolDescription}>{feedback.body}</Text><Text style={styles.postTag}>{developerRows.find((listing) => listing.id === feedback.listing_id)?.name || "MAS product"} · {feedback.status}</Text></View>{feedback.status !== "resolved" ? <TouchableOpacity onPress={() => void updateBetaFeedbackStatus(feedback,"resolved")}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>Resolve</Text></TouchableOpacity> : <TouchableOpacity onPress={() => void updateBetaFeedbackStatus(feedback,"open")}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>Reopen</Text></TouchableOpacity>}</View>)}
                  {!betaLoading && !betaFeedback.length ? <Text style={styles.emptyText}>No beta feedback has been submitted yet.</Text> : null}
                </>
              ) : developerScreen === "Team management" ? (
                <>
                  <View style={styles.infoBanner}><Text style={styles.infoTitle}>Team access</Text><Text style={styles.infoText}>Invitations are recorded in your MAS workspace. Actual member access depends on the existing account membership workflow and database permissions.</Text></View>
                  <View style={styles.composeCard}>
                    <Text style={styles.fieldLabel}>Teammate email</Text>
                    <TextInput value={teamEmail} onChangeText={(value) => setTeamEmail(value.slice(0,255))} autoCapitalize="none" keyboardType="email-address" placeholder="teammate@example.mw" placeholderTextColor={COLORS.muted} style={styles.formInput}/>
                    <Text style={styles.fieldLabel}>Role</Text>
                    <View style={styles.chips}>{([["admin","Admin"],["editor","Editor"],["viewer","Viewer"]] as [string,string][]).map(([value,label]) => <TouchableOpacity key={value} onPress={() => setTeamRole(value)} style={[styles.chip,teamRole === value && [styles.chipActive,{borderColor:accentColor,backgroundColor:accentColor+"18"}]]}><Text style={[styles.chipText,teamRole === value && [styles.chipTextActive,{color:accentColor}]]}>{label}</Text></TouchableOpacity>)}</View>
                    <TouchableOpacity disabled={teamSaving} style={[[styles.primaryButton,{backgroundColor:accentColor}],teamSaving && {opacity:0.5}]} onPress={() => void inviteTeamMember()}><Text style={styles.primaryButtonText}>{teamSaving ? "Inviting…" : "Invite teammate"}</Text></TouchableOpacity>
                  </View>
                  <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Members</Text><Text style={styles.sectionMeta}>{teamMembers.length}</Text></View>
                  {teamLoading ? <ActivityIndicator color={accentColor}/> : teamMembers.map((member) => <View key={member.id} style={styles.toolCard}><View style={styles.toolCopy}><Text style={styles.toolTitle}>{member.email}</Text><Text style={styles.toolDescription}>Role: {member.role} · Status: {member.status}</Text><Text style={styles.postTag}>{member.created_at ? new Date(member.created_at).toLocaleDateString() : ""}</Text><View style={styles.chips}>{(["admin","editor","viewer"]).map((role) => <TouchableOpacity key={role} onPress={() => role !== member.role ? void updateTeamMember(member,{role}) : undefined} style={[styles.chip,member.role === role && [styles.chipActive,{borderColor:accentColor,backgroundColor:accentColor+"18"}]]}><Text style={[styles.chipText,member.role === role && [styles.chipTextActive,{color:accentColor}]]}>{role}</Text></TouchableOpacity>)}</View></View><View style={{gap:8,alignItems:"flex-end"}}>{member.status !== "active" ? <TouchableOpacity onPress={() => void updateTeamMember(member,{status:"active"})}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>Activate</Text></TouchableOpacity> : <TouchableOpacity onPress={() => void updateTeamMember(member,{status:"invited"})}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>Deactivate</Text></TouchableOpacity>}<TouchableOpacity onPress={() => void removeTeamMember(member)}><Text style={styles.removeMediaText}>Remove</Text></TouchableOpacity></View></View>)}
                  {!teamLoading && !teamMembers.length ? <Text style={styles.emptyText}>No team members yet. Invite a collaborator to start.</Text> : null}
                  <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Activity log</Text><Text style={styles.sectionMeta}>{teamActivity.length}</Text></View>
                  {teamActivity.map((item) => <View key={item.id} style={styles.toolCard}><View style={styles.toolCopy}><Text style={styles.toolTitle}>{item.action}</Text>{item.target ? <Text style={styles.toolDescription}>{item.target}</Text> : null}<Text style={styles.postTag}>{item.created_at ? new Date(item.created_at).toLocaleString() : ""}</Text></View></View>)}
                  {!teamLoading && !teamActivity.length ? <Text style={styles.emptyText}>Team actions will appear here.</Text> : null}
                </>
              ) : developerScreen === "Spotlight" ? (
                <>
                  <View style={styles.infoBanner}><Text style={styles.infoTitle}>Feature opportunities</Text><Text style={styles.infoText}>Apply for App Spotlight, Developer Spotlight, Project Spotlight, podcast features or Made in Malawi features. Applications are reviewed by MAS; submission does not guarantee selection.</Text></View>
                  <View style={styles.composeCard}>
                    <Text style={styles.fieldLabel}>Opportunity</Text>
                    <View style={styles.chips}>{(["App Spotlight","Developer Spotlight","Project Spotlight","Podcast feature","Made in Malawi feature"]).map((item) => <TouchableOpacity key={item} onPress={() => setSpotlightOpportunity(item)} style={[styles.chip,spotlightOpportunity === item && [styles.chipActive,{borderColor:accentColor,backgroundColor:accentColor+"18"}]]}><Text style={[styles.chipText,spotlightOpportunity === item && [styles.chipTextActive,{color:accentColor}]]}>{item}</Text></TouchableOpacity>)}</View>
                    <Text style={styles.fieldLabel}>Product (optional)</Text>
                    <View style={styles.chips}><TouchableOpacity onPress={() => setSpotlightListingId("")} style={[styles.chip,!spotlightListingId && [styles.chipActive,{borderColor:accentColor,backgroundColor:accentColor+"18"}]]}><Text style={[styles.chipText,!spotlightListingId && [styles.chipTextActive,{color:accentColor}]]}>No specific product</Text></TouchableOpacity>{developerRows.map((listing) => <TouchableOpacity key={listing.id} onPress={() => setSpotlightListingId(listing.id)} style={[styles.chip,spotlightListingId === listing.id && [styles.chipActive,{borderColor:accentColor,backgroundColor:accentColor+"18"}]]}><Text style={[styles.chipText,spotlightListingId === listing.id && [styles.chipTextActive,{color:accentColor}]]}>{listing.name}</Text></TouchableOpacity>)}</View>
                    <Text style={styles.fieldLabel}>Pitch (at least 30 characters)</Text>
                    <TextInput value={spotlightPitch} onChangeText={(value) => setSpotlightPitch(value.slice(0,800))} multiline maxLength={800} placeholder="What are you building, who is it for in Malawi, and why should it be featured?" placeholderTextColor={COLORS.muted} style={[styles.formInput,{minHeight:110,textAlignVertical:"top"}]}/>
                    <TouchableOpacity disabled={spotlightSaving} style={[[styles.primaryButton,{backgroundColor:accentColor}],spotlightSaving && {opacity:0.5}]} onPress={() => void submitSpotlightApplication()}><Text style={styles.primaryButtonText}>{spotlightSaving ? "Submitting…" : "Submit application"}</Text></TouchableOpacity>
                  </View>
                  <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Your applications</Text><Text style={styles.sectionMeta}>{spotlightApplications.length}</Text></View>
                  {spotlightLoading ? <ActivityIndicator color={accentColor}/> : spotlightApplications.map((item) => <View key={item.id} style={styles.toolCard}><View style={styles.toolCopy}><Text style={styles.toolTitle}>{item.opportunity}</Text><Text style={styles.toolDescription}>{item.pitch}</Text><Text style={styles.postTag}>{item.status} · {item.created_at ? new Date(item.created_at).toLocaleDateString() : ""}</Text></View></View>)}
                  {!spotlightLoading && !spotlightApplications.length ? <Text style={styles.emptyText}>You have not submitted a Spotlight application yet.</Text> : null}
                </>
              ) : developerScreen === "Developer Pro" ? (
                <>
                  <View style={styles.infoBanner}>
                    <Text style={styles.infoTitle}>Developer Pro · MK5,000/month</Text>
                    <Text style={styles.infoText}>Professional tools for developers. Payment is completed through MAS's existing secure PayChangu checkout; this screen never handles card or mobile-money details.</Text>
                  </View>
                  <View style={styles.toolCard}>
                    <View style={styles.toolCopy}>
                      <Text style={styles.toolTitle}>{proLoading ? "Checking subscription…" : proSubscription?.status === "active" ? "Subscription active" : proSubscription?.status === "cancelled" ? "Subscription cancelled" : "Free plan"}</Text>
                      <Text style={styles.toolDescription}>{proSubscription?.current_period_end ? (proSubscription.status === "cancelled" ? "Access ends " : "Current period ends ") + new Date(proSubscription.current_period_end).toLocaleDateString() : proSubscription?.status === "active" ? "Your active plan is recorded in MAS." : "Activate Developer Pro to access paid developer features."}</Text>
                    </View>
                    <TouchableOpacity onPress={() => void Linking.openURL("https://malawian-app-store-j6pm.vercel.app/console/subscription").catch(() => showNotice("Could not open Developer Pro checkout."))}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>Manage plan →</Text></TouchableOpacity>
                  </View>
                  <View style={styles.composeCard}>
                    <Text style={styles.sectionTitle}>Included tools</Text>
                    {[
                      "Developer verification and a Verified Developer badge when approved",
                      "Product publishing and release management",
                      "Advanced analytics where available",
                      "Product promotion and Spotlight application tools",
                      "Kwacha checkout through the existing PayChangu workflow",
                    ].map((item) => <Text key={item} style={styles.postTag}>✓  {item}</Text>)}
                    <TouchableOpacity style={[[styles.primaryButton,{backgroundColor:accentColor}], { backgroundColor: accentColor }]} onPress={() => void Linking.openURL("https://malawian-app-store-j6pm.vercel.app/console/subscription").catch(() => showNotice("Could not open secure checkout."))}><Text style={styles.primaryButtonText}>{proSubscription?.status === "active" ? "Open subscription management" : "Continue to secure checkout"}</Text></TouchableOpacity>
                    <Text style={styles.disclaimer}>The hosted checkout and cancellation actions remain on the MAS web service so payment validation and subscription changes stay server-side. If prompted, sign in to your MAS account in the browser.</Text>
                  </View>
                </>
              ) : developerScreen === "Verification" ? (
                <>
                  <View style={styles.infoBanner}>
                    <Text style={styles.infoTitle}>Developer verification</Text>
                    <Text style={styles.infoText}>Submit your details for manual review or continue through Didit. Your status changes only when MAS confirms the result.</Text>
                  </View>
                  <View style={styles.toolCard}>
                    <View style={styles.toolCopy}>
                      <Text style={styles.toolTitle}>Current status: {verificationStatus.replace(/_/g, " ")}</Text>
                      <Text style={styles.toolDescription}>Keep your contact number current. Identity documents are stored for verification review.</Text>
                    </View>
                    <TouchableOpacity onPress={() => void refreshVerificationStatus()}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>Refresh</Text></TouchableOpacity>
                  </View>
                  <View style={styles.composeCard}>
                    <Text style={styles.fieldLabel}>WhatsApp / contact number (international format)</Text>
                    <TextInput value={verificationPhone} onChangeText={setVerificationPhone} keyboardType="phone-pad" placeholder="+265991234567" placeholderTextColor={COLORS.muted} style={styles.formInput}/>
                    <TouchableOpacity disabled={verificationSaving} style={[[styles.primaryButton,{backgroundColor:accentColor}], verificationSaving && {opacity:0.5}]} onPress={() => void saveVerificationPhone()}><Text style={styles.primaryButtonText}>{verificationSaving ? "Saving…" : "Save contact number"}</Text></TouchableOpacity>
                  </View>
                  {MANUAL_KYC_UPLOAD_ENABLED ? (
                    <View style={styles.composeCard}>
                      <Text style={styles.sectionTitle}>Manual identity review</Text>
                      <Text style={styles.fieldLabel}>Full legal name</Text>
                      <TextInput value={verificationFullName} onChangeText={setVerificationFullName} autoCapitalize="words" placeholder="As shown on your document" placeholderTextColor={COLORS.muted} style={styles.formInput}/>
                      <Text style={styles.fieldLabel}>Document type</Text>
                      <View style={styles.chips}>{(["National ID","Passport","Driver's license"] as string[]).map((item) => <TouchableOpacity key={item} onPress={() => setVerificationIdType(item)} style={[styles.chip,verificationIdType === item && [styles.chipActive,{borderColor:accentColor,backgroundColor:accentColor+"18"}]]}><Text style={[styles.chipText,verificationIdType === item && [styles.chipTextActive,{color:accentColor}]]}>{item}</Text></TouchableOpacity>)}</View>
                      <Text style={styles.fieldLabel}>Document number</Text>
                      <TextInput value={verificationIdNumber} onChangeText={setVerificationIdNumber} autoCapitalize="characters" placeholder="Enter document number" placeholderTextColor={COLORS.muted} style={styles.formInput}/>
                      <TouchableOpacity style={styles.mediaAttachButton} onPress={() => void chooseVerificationDocument()}><Text style={styles.mediaAttachText}>{verificationDocument ? verificationDocument.name : "＋ Attach ID/passport image or PDF (max 10 MB)"}</Text></TouchableOpacity>
                      {verificationDocument ? <TouchableOpacity onPress={() => setVerificationDocument(null)}><Text style={styles.removeMediaText}>Remove selected document</Text></TouchableOpacity> : null}
                      <TouchableOpacity disabled={verificationSaving} style={[[styles.primaryButton,{backgroundColor:accentColor}],verificationSaving && {opacity:0.5}]} onPress={() => void submitManualVerification()}><Text style={styles.primaryButtonText}>{verificationSaving ? "Submitting…" : "Submit for manual review"}</Text></TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.infoBanner}>
                      <Text style={styles.infoTitle}>Manual ID upload unavailable</Text>
                      <Text style={styles.infoText}>The private KYC document bucket is not configured in the live MAS backend. No identity document will be uploaded from this screen. Use the secure Didit verification flow below.</Text>
                    </View>
                  )}
                  <View style={styles.composeCard}>
                    <Text style={styles.sectionTitle}>Automatic verification</Text>
                    <Text style={styles.toolDescription}>Didit opens in a secure external page. MAS updates your status after the server confirms the result.</Text>
                    <TouchableOpacity disabled={diditLoading} style={[[styles.primaryButton,{backgroundColor:accentColor}],diditLoading && {opacity:0.5}]} onPress={() => void startDiditVerification()}><Text style={styles.primaryButtonText}>{diditLoading ? "Preparing secure verification…" : "Verify with Didit"}</Text></TouchableOpacity>
                  </View>
                  <Text style={styles.disclaimer}>Never share verification documents through Social or direct messages. If an upload fails, your submission has not been confirmed.</Text>
                </>
              ) : developerScreen === "Console settings" ? (
                <>
                  <View style={styles.infoBanner}>
                    <Text style={styles.infoTitle}>Developer console settings</Text>
                    <Text style={styles.infoText}>Open the relevant account area below. Sensitive account, authentication, payment and identity changes remain protected by the existing MAS backend.</Text>
                  </View>
                  {[
                    ["Public developer profile", "Edit your public developer information.", "My public profile"],
                    ["Product listings", "Manage product drafts, releases and listing status.", "My applications"],
                    ["Developer verification", "Review identity verification status and submission.", "Verification"],
                    ["Developer Pro", "Review plan access and continue to secure hosted checkout.", "Developer Pro"],
                    ["Wallet & earnings", "Review ledger readiness and payout safety.", "Developer wallet"],
                    ["Security settings", "Manage account security in the existing secure workflow.", "Security"],
                    ["Developer resources", "Read publishing guidance and submit feature requests.", "Developer resources"],
                    ["Promotion campaigns", "Create and manage product promotion campaigns.", "Promote a product"],
                  ].map(([title, description, target]) => (
                    <TouchableOpacity key={title} style={styles.toolCard} accessibilityRole="button" onPress={() => setDeveloperScreen(target)}>
                      <View style={styles.toolCopy}><Text style={styles.toolTitle}>{title}</Text><Text style={styles.toolDescription}>{description}</Text></View><Text style={styles.chevron}>›</Text>
                    </TouchableOpacity>
                  ))}
                  <Text style={styles.disclaimer}>Settings navigation is native. Provider-backed security changes and financial operations are not simulated in this screen.</Text>
                </>
              ) : developerScreen === "Developer wallet" ? (
                <>
                  <View style={styles.infoBanner}>
                    <Text style={styles.infoTitle}>Wallet & earnings</Text>
                    <Text style={styles.infoText}>Your developer wallet is not yet connected to a verified earnings ledger. No sample balance is shown as real money, and withdrawals are disabled until a secure ledger, identity checks, payout support, refunds and settlement rules are in place.</Text>
                  </View>
                  <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Wallet status</Text><Text style={styles.sectionMeta}>Setup pending</Text></View>
                  <View style={styles.toolCard}>
                    <View style={styles.toolCopy}>
                      <Text style={styles.toolTitle}>Available balance</Text>
                      <Text style={styles.toolDescription}>Your verified, withdrawable balance will appear when a real ledger is connected.</Text>
                    </View>
                  </View>
                  <View style={styles.toolCard}>
                    <View style={styles.toolCopy}>
                      <Text style={styles.toolTitle}>Pending funds</Text>
                      <Text style={styles.toolDescription}>Funds awaiting settlement, delivery confirmation or refund checks.</Text>
                    </View>
                  </View>
                  <View style={styles.toolCard}>
                    <View style={styles.toolCopy}>
                      <Text style={styles.toolTitle}>Transaction history</Text>
                      <Text style={styles.toolDescription}>Marketplace sales, fees, refunds and payouts will be listed only when backed by verified transaction records.</Text>
                    </View>
                  </View>
                  <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Payment and payout safety</Text></View>
                  <View style={styles.toolCard}><View style={styles.toolCopy}><Text style={styles.toolTitle}>Developer Pro payments</Text><Text style={styles.toolDescription}>PayChangu checkout is handled by the secure hosted payment flow. A subscription payment is not developer earnings.</Text></View><TouchableOpacity style={styles.secondaryButton} onPress={() => setDeveloperScreen("Developer Pro")}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>View Pro</Text></TouchableOpacity></View>
                  <View style={styles.toolCard}><View style={styles.toolCopy}><Text style={styles.toolTitle}>Protected withdrawals</Text><Text style={styles.toolDescription}>Withdrawals are unavailable until identity and payout details are verified and eligible funds are supported by the ledger.</Text></View><Text style={styles.postTag}>Disabled</Text></View>
                  <View style={styles.toolCard}><View style={styles.toolCopy}><Text style={styles.toolTitle}>One shared ledger</Text><Text style={styles.toolDescription}>Marketplace and eligible Social earnings need consistent transaction records, commissions, refunds and payout history.</Text></View></View>
                  <Text style={styles.disclaimer}>No money movement is initiated from this screen. Balance, transaction history, settlement, refunds and withdrawals require server-authoritative financial records.</Text>
                </>
              ) : developerScreen === "Promote a product" ? (
                <>
                  <View style={styles.infoBanner}>
                    <Text style={styles.infoTitle}>Promote your product</Text>
                    <Text style={styles.infoText}>Create a campaign in MWK, choose a placement and target location, and submit it for review. Submitting a campaign does not charge you; payment and campaign approval remain separate server-side steps.</Text>
                  </View>
                  <View style={styles.composeCard}>
                    <Text style={styles.fieldLabel}>Product</Text>
                    {promotionListings.length ? promotionListings.map((listing) => (
                      <TouchableOpacity key={listing.id} style={[styles.storeTab, promotionListingId === listing.id && [styles.storeTabActive,{borderBottomColor:accentColor}]]} onPress={() => setPromotionListingId(listing.id)}>
                        <Text style={[styles.storeTabText, promotionListingId === listing.id && [styles.storeTabTextActive,{color:accentColor}]]}>{listing.name} · {listing.status}</Text>
                      </TouchableOpacity>
                    )) : <Text style={styles.emptyText}>{promotionLoading ? "Loading your products…" : "No products found for this account. Create a product listing first."}</Text>}
                    <Text style={styles.fieldLabel}>Campaign name</Text>
                    <TextInput accessibilityLabel="Campaign name" value={promotionName} onChangeText={(value) => setPromotionName(value.slice(0, 60))} maxLength={60} placeholder="Launch week promotion" placeholderTextColor={COLORS.muted} style={styles.formInput} />
                    <Text style={styles.fieldLabel}>Placement</Text>
                    <View style={styles.storeTabs}>
                      {([["featured", "Featured"], ["search", "Search boost"], ["banner", "Store banner"]] as const).map(([value, label]) => (
                        <TouchableOpacity key={value} style={[styles.storeTab, promotionPlacement === value && [styles.storeTabActive,{borderBottomColor:accentColor}]]} onPress={() => setPromotionPlacement(value)}>
                          <Text style={[styles.storeTabText, promotionPlacement === value && [styles.storeTabTextActive,{color:accentColor}]]}>{label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={styles.fieldLabel}>Budget (MWK; minimum 1,000)</Text>
                    <TextInput accessibilityLabel="Campaign budget in MWK" value={promotionBudget} onChangeText={(value) => setPromotionBudget(value.replace(/[^0-9]/g, ""))} keyboardType="number-pad" style={styles.formInput} />
                    <Text style={styles.fieldLabel}>Duration (1–90 days)</Text>
                    <TextInput accessibilityLabel="Campaign duration in days" value={promotionDays} onChangeText={(value) => setPromotionDays(value.replace(/[^0-9]/g, ""))} keyboardType="number-pad" style={styles.formInput} />
                    <Text style={styles.fieldLabel}>Target location</Text>
                    <View style={styles.storeTabs}>
                      {["All Malawi", "Lilongwe", "Blantyre", "Mzuzu", "Zomba"].map((value) => (
                        <TouchableOpacity key={value} style={[styles.storeTab, promotionLocation === value && [styles.storeTabActive,{borderBottomColor:accentColor}]]} onPress={() => setPromotionLocation(value)}>
                          <Text style={[styles.storeTabText, promotionLocation === value && [styles.storeTabTextActive,{color:accentColor}]]}>{value}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TouchableOpacity accessibilityRole="button" disabled={promotionSaving || promotionLoading || !promotionListings.length} style={[[styles.primaryButton,{backgroundColor:accentColor}], (promotionSaving || promotionLoading || !promotionListings.length) && { opacity: 0.5 }]} onPress={() => void submitPromotionCampaign()}>
                      <Text style={styles.primaryButtonText}>{promotionSaving ? "Submitting campaign…" : "Submit campaign for review"}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Your campaigns</Text><Text style={styles.sectionMeta}>{promotionCampaigns.length}</Text></View>
                  {promotionLoading ? <ActivityIndicator color={accentColor} style={{ marginVertical: 16 }} /> : promotionCampaigns.length ? promotionCampaigns.map((campaign) => (
                    <View key={campaign.id} style={styles.toolCard}>
                      <View style={styles.toolCopy}>
                        <Text style={styles.toolTitle}>{campaign.name || "Promotion campaign"}</Text>
                        <Text style={styles.toolDescription}>{String(campaign.kind || "featured")} · {campaign.target_location || "All Malawi"} · MK{Number(campaign.budget_mwk || 0).toLocaleString()}</Text>
                        <Text style={styles.postTag}>Status: {campaign.status || "pending"} · {campaign.ends_at ? "Ends " + new Date(campaign.ends_at).toLocaleDateString() : "No end date"}</Text>
                        <View style={styles.detailStats}>
                          <View style={styles.detailStat}><Text style={styles.detailStatValue}>{Number(campaign.impressions || 0).toLocaleString()}</Text><Text style={styles.detailStatLabel}>Views</Text></View>
                          <View style={styles.detailStat}><Text style={styles.detailStatValue}>{Number(campaign.clicks || 0).toLocaleString()}</Text><Text style={styles.detailStatLabel}>Clicks</Text></View>
                          <View style={styles.detailStat}><Text style={styles.detailStatValue}>MK{Number(campaign.spent_mwk || 0).toLocaleString()}</Text><Text style={styles.detailStatLabel}>Spent</Text></View>
                          <View style={styles.detailStat}><Text style={styles.detailStatValue}>MK{Number(campaign.budget_mwk || 0).toLocaleString()}</Text><Text style={styles.detailStatLabel}>Budget</Text></View>
                        </View>
                      </View>
                      {campaign.status !== "paused" && campaign.status !== "rejected" && campaign.status !== "completed" ? <TouchableOpacity accessibilityRole="button" style={styles.secondaryButton} onPress={() => void pausePromotionCampaign(campaign)}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>Pause</Text></TouchableOpacity> : null}
                    </View>
                  )) : <Text style={styles.emptyText}>No campaigns yet. Submit a campaign above to start the review process.</Text>}
                  <Text style={styles.disclaimer}>Impressions, clicks, approval and billing are not fabricated in this app. They will only be shown when the MAS backend provides verified campaign metrics.</Text>
                </>
              ) : developerScreen === "Developer resources" ? (
                <>
                  <View style={styles.infoBanner}>
                    <Text style={styles.infoTitle}>Developer resources</Text>
                    <Text style={styles.infoText}>Publishing guidance, design standards, release preparation and FAQs. Submit a feature request to the shared MAS portal.</Text>
                  </View>
                  {[
                    ["Publishing guidelines", "Every listing is reviewed. Use a clear title and description, real screenshots, an appropriate icon, and a signed app build or secure HTTPS website URL. Never misrepresent functionality or collect data without consent."],
                    ["Design and media", "Use a square product icon and genuine product screenshots. Keep screenshot text readable on small phones and make the first screenshot demonstrate the core task."],
                    ["Versioning and updates", "Use semantic versions such as 1.4.2. Include release notes for each update and test a new release before publishing it to all users."],
                    ["Security and privacy", "Request only necessary permissions, protect credentials, validate uploads, and keep payment-provider secrets on the server. Do not expose identity documents or private storage URLs."],
                    ["Review and verification", "Submit complete listing information and required verification. Review outcomes are decided by MAS backend and moderation workflows, not by the client."],
                  ].map(([title, body]) => (
                    <View key={title} style={styles.toolCard}><View style={styles.toolCopy}><Text style={styles.toolTitle}>{title}</Text><Text style={styles.toolDescription}>{body}</Text></View></View>
                  ))}
                  <View style={styles.composeCard}>
                    <Text style={styles.sectionTitle}>Request a feature</Text>
                    <Text style={styles.fieldLabel}>Title (at least 5 characters)</Text>
                    <TextInput accessibilityLabel="Feature request title" value={featureRequestTitle} onChangeText={(value) => setFeatureRequestTitle(value.slice(0,100))} maxLength={100} placeholder="What should MAS support?" placeholderTextColor={COLORS.muted} style={styles.formInput} />
                    <Text style={styles.fieldLabel}>Details (optional)</Text>
                    <TextInput accessibilityLabel="Feature request details" value={featureRequestBody} onChangeText={(value) => setFeatureRequestBody(value.slice(0,2000))} maxLength={2000} multiline numberOfLines={4} textAlignVertical="top" placeholder="Explain the problem and how the feature would help." placeholderTextColor={COLORS.muted} style={[styles.formInput,{minHeight:100}]} />
                    <TouchableOpacity accessibilityRole="button" disabled={featureRequestSaving} style={[[styles.primaryButton,{backgroundColor:accentColor}],featureRequestSaving&&{opacity:0.5}]} onPress={() => void submitFeatureRequest()}>
                      <Text style={styles.primaryButtonText}>{featureRequestSaving ? "Submitting…" : "Submit feature request"}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Community requests</Text><Text style={styles.sectionMeta}>{featureRequests.length}</Text></View>
                  {featureRequestsLoading ? <ActivityIndicator color={accentColor} style={{marginVertical:16}} /> : featureRequests.length ? featureRequests.map((item) => (
                    <View key={item.id} style={styles.toolCard}>
                      <View style={styles.toolCopy}><Text style={styles.toolTitle}>{item.title}</Text><Text style={styles.toolDescription}>{item.body || "No additional details."}</Text><Text style={styles.postTag}>{item.status || "open"} · {Number(item.vote_count || 0)} votes · {item.created_at ? new Date(item.created_at).toLocaleDateString() : ""}</Text></View>
                      <TouchableOpacity accessibilityRole="button" disabled={featureRequestVotingId === item.id} onPress={() => void toggleFeatureRequestVote(item)} style={[styles.secondaryButton, featureRequestVotingId === item.id && { opacity: 0.5 }]}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>{featureRequestVotingId === item.id ? "Saving…" : featureRequestVoteIds.includes(item.id) ? "Remove vote" : "Vote"}</Text></TouchableOpacity>
                    </View>
                  )) : <Text style={styles.emptyText}>No feature requests found yet.</Text>}
                  <Text style={styles.disclaimer}>Feature requests and votes are stored in the shared MAS backend. Voting requires sign-in; review status remains controlled by the MAS moderation workflow.</Text>
                </>
              ) : nativeDeveloperPreviews[developerScreen] ? (
                <>
                  <View style={styles.infoBanner}>
                    <Text style={styles.infoTitle}>{developerScreen === "Developer resources" ? "Developer resources" : "Native workspace guidance"}</Text>
                    <Text style={styles.infoText}>{developerScreen === "Developer resources" ? "Practical publishing, listing-quality and security guidance for building on MAS." : "Use these checklists to prepare your workflow. Actions requiring a live provider or backend are explicitly identified and are not presented as completed."}</Text>
                  </View>
                  {nativeDeveloperPreviews[developerScreen].map((item) => (
                    <View key={item.title} style={styles.toolCard}>
                      <View style={styles.toolCopy}>
                        <Text style={styles.toolTitle}>{item.title}</Text>
                        <Text style={styles.toolDescription}>{item.description}</Text>
                        <Text style={styles.postTag}>{item.status}</Text>
                      </View>
                      <TouchableOpacity accessibilityRole="button" onPress={() => {
                        if (item.action === "Open assistant console") void Linking.openURL("https://malawian-app-store-j6pm.vercel.app/console/assistant").catch(() => showNotice("Could not open the MAS assistant. Check your connection and try again."));
                        else if (item.action === "Open promotion console") void Linking.openURL("https://malawian-app-store-j6pm.vercel.app/advertise").catch(() => showNotice("Could not open the promotion console. Check your connection and try again."));
                        else if (item.action === "Open promotion campaign manager") setDeveloperScreen("Promote a product");
                        else if (item.action === "Open security console") void Linking.openURL("https://malawian-app-store-j6pm.vercel.app/console/security").catch(() => showNotice("Could not open the security console. Check your connection and try again."));
                        else if (item.action === "Open Social") { setDeveloperScreen(null); setTab("Social"); }
                        else if (item.action === "Open Explore") { setDeveloperScreen(null); setTab("Explore"); }
                        else if (item.action === "Open notifications") { setDeveloperScreen(null); setUtilityScreen("notifications"); }
                        else if (item.action === "Open My applications") setDeveloperScreen("My applications");
                        else if (item.action === "Start a product draft") setDeveloperScreen("Publish a product");
                        else if (item.action === "Open quality checks") setDeveloperScreen("Quality checks");
                        else if (item.action === "Open publishing checklist") setDeveloperScreen("Publishing checklist");
                        else if (item.action === "Review team access") setDeveloperScreen("Team management");
                        else if (item.action === "Open Spotlight applications") setDeveloperScreen("Spotlight");
                        else if (item.action === "Review security notes" || item.action === "Review security rule") setDeveloperScreen("Security");
                        else if (item.action === "Open public profile") setDeveloperScreen("My public profile");
                        else if (item.action === "Open My applications" || item.action === "Review listing screens" || item.action === "Review store test") setDeveloperScreen("My applications");
                        else if (item.action === "Open Explore") { setDeveloperScreen(null); setTab("Explore"); }
                        else if (item.action === "Open Social" || item.action === "Review Social test") { setDeveloperScreen(null); setSocialSection("Feed"); setTab("Social"); }
                        else if (item.action === "Open notifications") { setDeveloperScreen(null); setUtilityScreen("notifications"); }
                        else if (item.action === "Record test status" || item.action === "Review account test") setDeveloperScreen("Testing");
                        else if (item.action === "Review analytics requirements") void Linking.openURL("https://malawian-app-store-j6pm.vercel.app/advertise").catch(() => showNotice("Could not open campaign analytics. Check your connection and try again."));
                        else showNotice(item.status === "Integration pending" || item.status === "Backend check" || item.status === "Integration test" ? "This action needs its backend integration and device testing before it can be marked complete." : "Review the checklist above and verify it during native app testing.");
                      }}><Text style={[styles.secondaryButtonText,{color:accentColor}]}>Review →</Text></TouchableOpacity>
                    </View>
                  ))}
                  <Text style={styles.disclaimer}>This workspace combines native workflows with clearly labeled guidance for tasks that still require a secure hosted provider or production backend. Campaign approval, payments, identity decisions and privileged moderation remain server-authoritative.</Text>
                </>
              ) : null}
              <Text style={styles.disclaimer}>Payment settlement, identity-provider decisions and wallet transactions remain server-authoritative. Hosted checkout and selected provider workflows open securely in the MAS web console; all native and hosted journeys still require final end-to-end acceptance testing.</Text>
            </>
          ) : null}
          <View style={styles.bottomSpace}/>
        </ScrollView>

        {notice ? <View accessibilityLiveRegion="polite" style={styles.toast}><Text style={styles.toastText}>{notice}</Text></View> : null}

        <View style={[styles.tabBar, { paddingBottom: windowHeight < 520 ? 2 : 8 }]}>
          {([
            ["Explore", "apps"],
            ["Library", "book"],
            ["Alerts", "bell"],
            ["Account", "user"],
          ] as [string, "apps" | "book" | "bell" | "user"][]).map(([name, icon]) => {
            const active = name === "Explore"
              ? tab === "Explore" && utilityScreen === "none" && developerScreen === null
              : name === "Library"
                ? utilityScreen === "library"
                : name === "Alerts"
                  ? utilityScreen === "notifications"
                  : (tab === "Profile" || tab === "Social" || tab === "Develop") && utilityScreen !== "library" && utilityScreen !== "notifications";
            return (
              <TouchableOpacity
                key={name}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={styles.tabItem}
                onPress={() => {
                  setSelectedApp(null);
                  setDeveloperScreen(null);
                  if (name === "Explore") {
                    setUtilityScreen("none");
                    setTab("Explore");
                  } else if (name === "Library") {
                    setTab("Profile");
                    setUtilityScreen("library");
                  } else if (name === "Alerts") {
                    setTab("Profile");
                    setUtilityScreen("notifications");
                  } else {
                    setUtilityScreen("none");
                    setTab("Profile");
                  }
                }}
              >
                <View style={[styles.tabIconPill, active && [styles.tabIconPillActive,{backgroundColor:accentColor+"18"}], active && { backgroundColor: `${accentColor}18` }]}>
                  <NativeIcon name={icon} color={active ? accentColor : COLORS.muted} size={21} />
                </View>
                <Text style={[styles.tabLabel, active && [styles.tabLabelActive,{color:accentColor}]]}>{name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFFFF" },
  app: { flex: 1, backgroundColor: "#FFFFFF" },
  header: { minHeight: 56, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8, flexDirection: "row", alignItems: "center", backgroundColor: COLORS.background },
  headerSearchBox: { minHeight: 44, flex: 1, minWidth: 0, width: "100%", flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 10, borderRadius: 24, backgroundColor: "#F3F3F3" },
  headerMenuButton: { width: 32, height: 36, flexShrink: 0, alignItems: "center", justifyContent: "center" },
  headerLogo: { width: 30, height: 30, flexShrink: 0 },
  
  headerSearchIcon: { color: COLORS.muted, fontSize: 22, lineHeight: 24, width: 18, textAlign: "center" },
  headerSearchInput: { flex: 1, minWidth: 0, minHeight: 42, paddingVertical: 0, color: COLORS.text, fontSize: 15 },
  brandMark: { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.accent, alignItems: "center", justifyContent: "center" },
  brandMarkText: { color: "#FFFFFF", fontSize: 21, fontWeight: "900" },
  brand: { color: COLORS.text, fontWeight: "900", fontSize: 17, letterSpacing: 1.4 },
  brandSub: { color: COLORS.muted, fontSize: 8, fontWeight: "700", letterSpacing: 1.3, marginTop: 2 },
  avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceAlt, alignItems: "center", justifyContent: "center" },
  avatarText: { color: COLORS.text, fontWeight: "800" },
  avatarImage: { width: 36, height: 36, borderRadius: 18 },
  content: { flex: 1, backgroundColor: "#FFFFFF" },
  contentInner: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 28, backgroundColor: "#FFFFFF" },
  hero: { padding: 0, borderRadius: 0, backgroundColor: COLORS.background, borderWidth: 0, borderColor: COLORS.border },
  eyebrow: { color: COLORS.green, fontSize: 10, fontWeight: "800", letterSpacing: 1.7, marginBottom: 12 },
  heroTitle: { color: COLORS.text, fontSize: 29, lineHeight: 35, fontWeight: "900", letterSpacing: -0.7 },
  heroText: { color: COLORS.muted, fontSize: 13, lineHeight: 20, marginTop: 10, marginBottom: 18 },
  searchBox: { minHeight: 40, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, backgroundColor: "#F3F3F3", borderRadius: 24, borderWidth: 1, borderColor: "#E1E1E1" },
  searchIcon: { color: COLORS.muted, fontSize: 25, marginRight: 8 },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 14, paddingVertical: 0, minHeight: 40 },
  storeTabs: { flexDirection: "row", gap: 24, borderBottomWidth: 1, borderBottomColor: COLORS.border, marginTop: 0, marginBottom: 12 },
  storeTab: { paddingTop: 4, paddingBottom: 10, borderBottomWidth: 3, borderBottomColor: "transparent" },
  storeTabActive: { borderBottomColor: COLORS.accent },
  storeTabText: { color: COLORS.muted, fontSize: 14, fontWeight: "500" },
  storeTabTextActive: { color: COLORS.accent, fontWeight: "700" },
  sectionHeading: { marginTop: 24, marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  shelfHeading: { marginTop: 24, marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  shelfHeadingCopy: { flex: 1 },
  shelfSubtitle: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  shelfChevron: { color: COLORS.muted, fontSize: 24, lineHeight: 28 },
  appNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  kindGlyph: { color: COLORS.muted, fontSize: 12 },
  sectionTitle: { color: COLORS.text, fontSize: 17, fontWeight: "600" },
  sectionMeta: { color: COLORS.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1.1 },
  chips: { gap: 8, paddingBottom: 15 },
  chip: { minHeight: 40, justifyContent: "center", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  chipActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accentSoft },
  chipText: { color: COLORS.muted, fontSize: 12, fontWeight: "500" },
  chipTextActive: { color: COLORS.accent },
  appCard: { flexDirection: "row", alignItems: "center", paddingHorizontal: 4, paddingVertical: 8, borderRadius: 0, borderWidth: 0, borderColor: "transparent", backgroundColor: COLORS.background, marginBottom: 0, gap: 16 },
  appIcon: { width: 64, height: 64, borderRadius: 18, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  appIconText: { color: "#FFFFFF", fontSize: 24, fontWeight: "900" },
  appIconFallbackText: { color: COLORS.accent, fontSize: 18, fontWeight: "600" },
  appIconImage: { width: "100%", height: "100%", borderRadius: 14 },
  nativeShelf: { marginTop: 2, marginBottom: 5 },
  nativeShelfRow: { gap: 16, paddingBottom: 8 },
  nativeShelfItem: { width: 104 },
  nativeShelfIcon: { width: 104, height: 104, borderRadius: 22, alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: 8 },
  nativeShelfIconImage: { width: "100%", height: "100%" },
  nativeShelfName: { color: COLORS.text, fontSize: 13, fontWeight: "500" },
  nativeShelfMeta: { color: COLORS.muted, fontSize: 11, marginTop: 3 },
  fieldLabel: { color: COLORS.text, fontSize: 11, fontWeight: "800", marginTop: 12, marginBottom: 6 },
  formInput: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 9, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background, color: COLORS.text, fontSize: 13 },
  devMetricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginVertical: 15 },
  devMetric: { width: "47%", borderWidth: 1, borderColor: COLORS.border, padding: 16, backgroundColor: COLORS.surface },
  devMetricValue: { color: COLORS.text, fontSize: 23, fontWeight: "900" },
  devMetricLabel: { color: COLORS.muted, fontSize: 11, marginTop: 4 },
  detailHero: { alignItems: "center", paddingVertical: 24, paddingHorizontal: 12 },
  detailIcon: { width: 112, height: 112, borderRadius: 26, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  detailIconImage: { width: "100%", height: "100%" },
  detailIconText: { color: "#FFFFFF", fontSize: 46, fontWeight: "900" },
  detailTitle: { color: COLORS.text, fontSize: 25, fontWeight: "900", marginTop: 16, textAlign: "center" },
  detailCategory: { color: COLORS.accent, fontSize: 12, fontWeight: "700", marginTop: 5, textAlign: "center" },
  listingScreenshot: { width: 220, height: 390, borderRadius: 14, backgroundColor: "#F3F3F3", borderWidth: 1, borderColor: "#E1E1E1", marginRight: 10 },
  detailDescription: { color: COLORS.muted, fontSize: 13, lineHeight: 20, marginTop: 14, textAlign: "center" },
  detailStats: { flexDirection: "row", alignSelf: "stretch", justifyContent: "space-around", gap: 8, marginTop: 22, paddingVertical: 15, borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.border },
  ratingRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  ratingStar: { fontSize: 26, color: COLORS.border },
  ratingStarActive: { color: "#F9AB00" },
  detailStat: { flex: 1, alignItems: "center" },
  detailStatValue: { color: COLORS.text, fontSize: 12, fontWeight: "800", textAlign: "center" },
  detailStatLabel: { color: COLORS.muted, fontSize: 10, marginTop: 5 },
  appDetails: { flex: 1 },
  appName: { color: COLORS.text, fontWeight: "500", fontSize: 15 },
  appCategory: { color: COLORS.muted, fontSize: 12, fontWeight: "400", marginTop: 3 },
  appDescription: { color: COLORS.muted, fontSize: 12, lineHeight: 16 },
  appMetricRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  appMetricRating: { color: COLORS.muted, fontSize: 12, lineHeight: 16 },
  appMetricStar: { color: "#4285F4", fontSize: 12, lineHeight: 16 },
  appMetricDot: { color: COLORS.muted, fontSize: 12, lineHeight: 16 },
  chevron: { color: COLORS.muted, fontSize: 25, paddingHorizontal: 2 },
  emptyText: { color: COLORS.muted, padding: 18, textAlign: "center" },
  infoBanner: { padding: 17, marginTop: 15, backgroundColor: "#F7FBF7", borderWidth: 1, borderColor: "#DDEFE0", borderRadius: 16 },
  infoTitle: { color: COLORS.text, fontWeight: "800", fontSize: 15 },
  infoText: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  secondaryButton: { alignSelf: "flex-start", marginTop: 13, paddingVertical: 8 },
  secondaryButtonText: { color: "#188038", fontSize: 12, fontWeight: "800" },
  pageTitle: { color: COLORS.text, fontSize: 28, fontWeight: "900", letterSpacing: -0.5, marginTop: 7 },
  pageIntro: { color: COLORS.muted, fontSize: 13, lineHeight: 20, marginTop: 7, marginBottom: 20 },
  composeCard: { padding: 16, borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8 },
  composePrompt: { color: COLORS.muted, fontSize: 13 },
  mediaAttachButton: { alignSelf: "flex-start", marginTop: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, backgroundColor: COLORS.background },
  mediaAttachText: { color: "#188038", fontSize: 11, fontWeight: "800" },
  selectedMedia: { marginTop: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 9, backgroundColor: COLORS.background, borderRadius: 8 },
  selectedMediaText: { color: COLORS.muted, fontSize: 10, flex: 1 },
  removeMediaText: { color: "#D93025", fontSize: 10, fontWeight: "800", marginLeft: 10 },
  postMediaImage: { width: "100%", height: 230, marginTop: 12, borderRadius: 10, backgroundColor: COLORS.background },
  mediaLink: { marginTop: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8 },
  mediaLinkText: { color: "#188038", fontSize: 12, fontWeight: "800" },
  composeAction: { color: "#188038", fontSize: 12, fontWeight: "800", marginTop: 14 },
  postComposerInput: { minHeight: 82, maxHeight: 180, marginTop: 12, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background, color: COLORS.text, fontSize: 13, lineHeight: 19, textAlignVertical: "top" },
  composeFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  composeLimit: { color: COLORS.muted, fontSize: 10 },
  composeButton: { backgroundColor: COLORS.accent, paddingHorizontal: 15, paddingVertical: 10, borderRadius: 8 },
  composeButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  postCard: { padding: 15, borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  smallAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.accentSoft, alignItems: "center", justifyContent: "center" },
  smallAvatarText: { color: "#188038", fontWeight: "900" },
  postIdentity: { flex: 1 },
  postName: { color: COLORS.text, fontSize: 13, fontWeight: "800" },
  postTag: { color: COLORS.muted, fontSize: 10, marginTop: 3 },
  postText: { color: "#374151", fontSize: 13, lineHeight: 20, marginTop: 14 },
  postActions: { flexDirection: "row", justifyContent: "space-between", marginTop: 16, paddingTop: 13, borderTopWidth: 1, borderTopColor: COLORS.border },
  commentsPanel: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  messageThread: { gap: 8, marginVertical: 12 },
  messageBubble: { maxWidth: "88%", padding: 11, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border },
  messageOwn: { alignSelf: "flex-end", backgroundColor: COLORS.accentSoft },
  messageOther: { alignSelf: "flex-start", backgroundColor: COLORS.surface },
  messageBody: { color: COLORS.text, fontSize: 12, lineHeight: 18 },
  messageTime: { color: COLORS.muted, fontSize: 9, marginTop: 5 },
  commentItem: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  commentAuthor: { color: COLORS.text, fontSize: 11, fontWeight: "800" },
  commentBody: { color: "#374151", fontSize: 12, lineHeight: 18, marginTop: 3 },
  commentInput: { minHeight: 44, maxHeight: 100, marginTop: 10, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background, color: COLORS.text, fontSize: 12, textAlignVertical: "top" },
  postAction: { color: COLORS.muted, fontSize: 11, fontWeight: "700" },
  developerStatus: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderWidth: 1, borderColor: "#B7E1CD", backgroundColor: "#E6F4EA", borderRadius: 10, marginBottom: 15 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.green },
  statusText: { color: COLORS.green, fontSize: 11, fontWeight: "700" },
  toolCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, borderRadius: 13, marginBottom: 10 },
  toolIcon: { width: 43, height: 43, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: COLORS.accentSoft },
  toolIconText: { color: "#188038", fontSize: 20, fontWeight: "800" },
  toolCopy: { flex: 1 },
  toolTitle: { color: COLORS.text, fontSize: 13, fontWeight: "800" },
  toolDescription: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  disclaimer: { color: COLORS.muted, fontSize: 10, lineHeight: 16, marginTop: 12 },
  profileCard: { alignItems: "center", padding: 24, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  profileAvatar: { width: 66, height: 66, borderRadius: 33, backgroundColor: COLORS.accent, alignItems: "center", justifyContent: "center" },
  profileAvatarText: { color: "#FFFFFF", fontSize: 26, fontWeight: "900" },
  profileName: { color: COLORS.text, fontSize: 17, fontWeight: "800", marginTop: 14 },
  profileHint: { color: COLORS.muted, textAlign: "center", fontSize: 12, lineHeight: 18, marginTop: 7 },
  primaryButton: { marginTop: 18, backgroundColor: COLORS.accent, borderRadius: 11, paddingHorizontal: 24, paddingVertical: 12 },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 12 },
  bottomSpace: { height: 22 },
  tabBar: { flexDirection: "row", backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 6, paddingBottom: 4, minHeight: 64 },
  tabItem: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 56, gap: 2, paddingVertical: 3 },
  tabIconPill: { width: 64, height: 28, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "transparent" },
  tabIconPillActive: { backgroundColor: COLORS.accentSoft },
  tabIcon: { color: COLORS.muted, fontSize: 20, lineHeight: 22 },
  tabActive: { color: COLORS.accent },
  tabLabel: { color: COLORS.muted, fontSize: 11, fontWeight: "500" },
  tabLabelActive: { color: COLORS.text },
  toast: { position: "absolute", bottom: 72, left: 18, right: 18, padding: 13, borderRadius: 10, backgroundColor: "#F3F4F6", borderWidth: 1, borderColor: COLORS.border },
  toastText: { color: COLORS.text, fontSize: 12, textAlign: "center" },
  authForm: { width: "100%", marginTop: 18, gap: 10 },
  authModeRow: { flexDirection: "row", gap: 8 },
  authModeButton: { flex: 1, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: "center" },
  authModeText: { color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  authDivider: { color: COLORS.muted, fontSize: 10, fontWeight: "700", textAlign: "center", marginTop: 4 },
  accentGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  accentChoice: { minWidth: "30%", flexGrow: 1, flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 9, paddingVertical: 10 },
  accentSwatch: { width: 16, height: 16, borderRadius: 8 },
  accentChoiceText: { color: COLORS.text, fontSize: 11, fontWeight: "600" },
  accentCheck: { marginLeft: "auto", fontWeight: "900" },
  drawerRoot: { flex: 1, flexDirection: "row", backgroundColor: "rgba(0,0,0,0.35)" },
  drawerBackdrop: { flex: 1, minWidth: 0 },
  drawerPanel: { width: "82%", maxWidth: 420, minWidth: 0, height: "100%", flexShrink: 0, backgroundColor: "#FFFFFF", paddingTop: 18, paddingHorizontal: 16, paddingBottom: 12, borderTopRightRadius: 18, borderBottomRightRadius: 18 },
  drawerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 22, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  drawerTitle: { color: COLORS.text, fontSize: 17, fontWeight: "900" },
  drawerClose: { color: COLORS.muted, fontSize: 30, lineHeight: 32, paddingHorizontal: 6 },
  drawerSection: { color: COLORS.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.4, marginTop: 22, marginBottom: 8 },
  drawerItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#F0F0F0" },
  drawerItemCopy: { flex: 1 },
  drawerItemTitle: { color: COLORS.text, fontSize: 13, fontWeight: "700" },
  drawerItemDescription: { color: COLORS.muted, fontSize: 10, marginTop: 3 },
  drawerChevron: { color: COLORS.muted, fontSize: 22 },
  drawerFooter: { marginTop: "auto", paddingTop: 18 },
  drawerFooterText: { color: COLORS.muted, fontSize: 10, lineHeight: 15 },
});