export type UserRole = 'admin' | 'author' | 'user';
export type AuthorStatus = 'none' | 'pending' | 'approved';
export type SubscriptionType = 'free' | 'premium';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  role: UserRole;
  authorStatus: AuthorStatus;
  subscription?: SubscriptionType;
  audioPreferences?: {
    voiceId?: string;
    speed?: number;
    autoScroll?: boolean;
    sleepTimer?: number;
  };
  createdAt?: string;
}

export interface Story {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  content: string; // introductory/legacy content
  genre: string;
  mood: string;
  imageUrl?: string;
  audioUrl?: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected';
  safetyStatus: 'unchecked' | 'safe' | 'flagged';
  safetyReason?: string;
  viewsCount?: number;
  likesCount?: number;
  ratingCount?: number;
  averageRating?: number;
  isPremiumOnly?: boolean;
  createdAt?: any; // Firestore Timestamp or string
}

export interface Chapter {
  id: string;
  storyId: string;
  title: string;
  content: string;
  order: number;
  imageUrl?: string;
  audioUrl?: string;
  createdAt?: any;
}

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  text: string;
  parentId?: string; // for replies!
  reportCount?: number;
  isReported?: boolean;
  reportedBy?: string[];
  createdAt?: any;
}

export interface Rating {
  userId: string;
  rating: number; // 1-5
  createdAt?: any;
}

export interface Like {
  userId: string;
  createdAt?: any;
}

export interface ReadingProgress {
  storyId: string;
  storyTitle: string;
  authorName: string;
  imageUrl?: string;
  lastReadChapterId?: string;
  lastReadChapterTitle?: string;
  lastReadPosition?: number;
  progressPercentage: number;
  viewedAt: any;
}

export interface Character {
  id: string;
  userId: string;
  name: string;
  age: string;
  gender: string;
  personality: string;
  abilities: string;
  genre: string;
  bio: string;
  background: string;
  imagePrompt: string;
  imageUrl?: string;
  createdAt?: any;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'like' | 'comment' | 'system' | 'role';
  isRead: boolean;
  createdAt: any;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}
