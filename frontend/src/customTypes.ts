import type {
  CommunityCreate,
  CommunityMemberRole,
  CommunityMemberStatus,
  CommunityPublic,
  CommunityUpdate,
  InterestPublic,
  ItemType,
  UserProfilePublic,
  UserProfileUpdate,
  UserPublic,
  UserSettingsSchema,
} from "./client"

export type {
  ItemType,
  UserProfileUpdate,
  UserSettingsSchema as UserSettingsUpdate,
  InterestPublic,
}

export interface CommunityCreateExtended extends CommunityCreate {
  requires_approval?: boolean
  is_private?: boolean
}

export interface CommunityUpdateExtended extends CommunityUpdate {
  requires_approval?: boolean
  is_private?: boolean
}

export interface CommunityPublicExtended extends CommunityPublic {
  requires_approval?: boolean
  is_private?: boolean
  current_user_status?: CommunityMemberStatus | null
}

export interface UserPublicWithRole extends UserPublic {
  community_role?: CommunityMemberRole
  community_status?: CommunityMemberStatus
}

export interface UserProfilePublicExtended
  extends Omit<UserProfilePublic, "image_url"> {
  image_url?: string | null
}

export interface UserUpdateMe {
  full_name?: string
  email?: string
  password?: string
}

export interface UserPublicExtended extends Omit<UserPublic, "profile"> {
  profile?: UserProfilePublicExtended
  settings?: UserSettingsSchema
  interests?: InterestPublic[]
}
