export type Account = {
  id: string;
  username: string;
  name: string;
  profile_picture: string;
  health_score: number;
  followers: number;
  posts?: number;
  last_post_at: string;
  token_expires_at: string | null;
  token_status: "valid" | "expired";
  provider: "facebook" | "instagram";
  can_publish?: boolean;
  role?: "active" | "reserve" | "discarded";
  paused?: boolean;
  model_id?: string | null;
  meta_app_id?: string | null;
};

export const mockAccounts: Account[] = [
  {
    id: "1",
    username: "atelier.noir",
    name: "Atelier Noir",
    profile_picture: "https://api.dicebear.com/9.x/glass/svg?seed=atelier",
    health_score: 92,
    followers: 18420,
    last_post_at: "2026-05-24T18:30:00Z",
    token_expires_at: "2026-07-12T00:00:00Z",
    token_status: "valid",
    provider: "facebook",
  },
  {
    id: "2",
    username: "neon.diary",
    name: "Neon Diary",
    profile_picture: "https://api.dicebear.com/9.x/glass/svg?seed=neon",
    health_score: 74,
    followers: 6320,
    last_post_at: "2026-05-23T09:12:00Z",
    token_expires_at: "2026-06-02T00:00:00Z",
    token_status: "valid",
    provider: "facebook",
  },
  {
    id: "3",
    username: "kombu.studio",
    name: "Kombu Studio",
    profile_picture: "https://api.dicebear.com/9.x/glass/svg?seed=kombu",
    health_score: 58,
    followers: 2104,
    last_post_at: "2026-05-20T22:00:00Z",
    token_expires_at: "2026-05-30T00:00:00Z",
    token_status: "expired",
    provider: "facebook",
  },
  {
    id: "4",
    username: "lume.cafe",
    name: "Lume Café",
    profile_picture: "https://api.dicebear.com/9.x/glass/svg?seed=lume",
    health_score: 88,
    followers: 9870,
    last_post_at: "2026-05-25T07:45:00Z",
    token_expires_at: "2026-08-01T00:00:00Z",
    token_status: "valid",
    provider: "facebook",
  },
];

export type QueueItem = {
  id: string;
  account: string;
  caption: string;
  scheduled_at: string;
  media_type: "REEL" | "IMAGE" | "STORY";
  media_key?: string | null;
  thumb: string;
  group_id?: string | null;
  group_scheduled_at?: string | null;
  status: "scheduled" | "processing" | "failed" | "canceled" | "published";
  attempts?: number;
  retry_count?: number;
  last_error?: string | null;
  variant_processed?: boolean;
  variant_method?: string | null;
  variant_error?: string | null;
  loop_id?: string | null;
  cycle_number?: number | null;
};

export const mockQueue: QueueItem[] = [
  {
    id: "q1",
    account: "atelier.noir",
    caption: "Drop 03 — bastidores do shoot ✦",
    scheduled_at: "2026-05-25T19:00:00Z",
    media_type: "REEL",
    thumb: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=400",
    status: "scheduled",
  },
  {
    id: "q2",
    account: "neon.diary",
    caption: "Sexta-feira, cidade acordando 🌃",
    scheduled_at: "2026-05-25T21:30:00Z",
    media_type: "IMAGE",
    thumb: "https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=400",
    status: "scheduled",
  },
  {
    id: "q3",
    account: "lume.cafe",
    caption: "Novo grão da semana — Etiópia Yirgacheffe",
    scheduled_at: "2026-05-26T07:00:00Z",
    media_type: "STORY",
    thumb: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400",
    status: "processing",
  },
  {
    id: "q4",
    account: "kombu.studio",
    caption: "Workshop de cerâmica — últimas vagas",
    scheduled_at: "2026-05-26T12:00:00Z",
    media_type: "REEL",
    thumb: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=400",
    status: "failed",
  },
  {
    id: "q5",
    account: "neon.diary",
    caption: "Sequência pausada para revisão",
    scheduled_at: "2026-05-27T09:00:00Z",
    media_type: "IMAGE",
    thumb: "https://images.unsplash.com/photo-1520975954732-35dd22299614?w=400",
    status: "canceled",
  },
];

export const mockHistory = [
  {
    id: "h1",
    account: "atelier.noir",
    caption: "Editorial primavera",
    published_at: "2026-05-24T18:30:00Z",
    reach: 12400,
    likes: 980,
    comments: 42,
    thumb: "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=400",
  },
  {
    id: "h2",
    account: "lume.cafe",
    caption: "Latte art — domingo lento",
    published_at: "2026-05-24T09:00:00Z",
    reach: 4200,
    likes: 312,
    comments: 18,
    thumb: "https://images.unsplash.com/photo-1511920170033-f8396924c348?w=400",
  },
  {
    id: "h3",
    account: "neon.diary",
    caption: "POV: 23h, Vila Madalena",
    published_at: "2026-05-23T09:12:00Z",
    reach: 8800,
    likes: 740,
    comments: 56,
    thumb: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400",
  },
];
