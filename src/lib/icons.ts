// Icon registry for the personalization picker + per-type defaults. Lucide only
// (no emoji, ever). The user dresses an item with any of these; an undressed
// item falls back to a sensible default for its content type (lock when
// confidential).

import type { LucideIcon } from "lucide-react";
import {
  Lock, KeyRound, Wifi, Link as LinkIcon, Code, FileText, Image as ImageIcon,
  CreditCard, Mail, Globe, Hash, Star, Folder, Terminal, Shield, Bookmark,
  Phone, Calendar, Briefcase, Heart, User, MapPin, StickyNote, Database,
} from "lucide-react";
import type { ContentType } from "./types";

export type IconName =
  | "note" | "lock" | "key" | "wifi" | "link" | "code" | "file" | "image"
  | "card" | "mail" | "globe" | "hash" | "star" | "folder" | "terminal"
  | "shield" | "bookmark" | "phone" | "calendar" | "briefcase" | "heart"
  | "user" | "pin" | "database";

export const ICONS: Record<IconName, LucideIcon> = {
  note: StickyNote,
  lock: Lock,
  key: KeyRound,
  wifi: Wifi,
  link: LinkIcon,
  code: Code,
  file: FileText,
  image: ImageIcon,
  card: CreditCard,
  mail: Mail,
  globe: Globe,
  hash: Hash,
  star: Star,
  folder: Folder,
  terminal: Terminal,
  shield: Shield,
  bookmark: Bookmark,
  phone: Phone,
  calendar: Calendar,
  briefcase: Briefcase,
  heart: Heart,
  user: User,
  pin: MapPin,
  database: Database,
};

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

const TYPE_DEFAULT: Record<ContentType, IconName> = {
  note: "note",
  link: "link",
  image: "image",
  file: "file",
  code: "code",
};

/** Default icon for an item that hasn't been given one. */
export function defaultIcon(type: ContentType, confidential: boolean): IconName {
  if (confidential) return "lock";
  return TYPE_DEFAULT[type];
}
