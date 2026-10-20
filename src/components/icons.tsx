// Phosphor icons under the names the app used with lucide; weight and default size come from IconContext in main.tsx.
import { forwardRef } from 'react';
import {
  ArrowCounterClockwise, ArrowLeft as PhArrowLeft, ArrowRight as PhArrowRight, ArrowUpRight as PhArrowUpRight, CaretDown,
  CaretRight, Check as PhCheck, Plus as PhPlus, X as PhX, type Icon, type IconProps,
} from '@phosphor-icons/react';

// Glyphs made of bare lines look heavy in duotone, so they keep the plain outline.
const outline = (Glyph: Icon) => forwardRef<SVGSVGElement, IconProps>((props, ref) => <Glyph ref={ref} weight="regular" {...props} />);
export const ArrowLeft = outline(PhArrowLeft), ArrowRight = outline(PhArrowRight), ArrowUpRight = outline(PhArrowUpRight);
export const Check = outline(PhCheck), ChevronDown = outline(CaretDown), ChevronRight = outline(CaretRight);
export const Plus = outline(PhPlus), RotateCcw = outline(ArrowCounterClockwise), X = outline(PhX);

export {
  Pulse as Activity, Warning as AlertTriangle, ArrowLineDown as ArrowDownToLine,
  Bluetooth, BookOpen, Envelope as Mail, Eye, EyeSlash as EyeOff, Briefcase as BriefcaseBusiness, CalendarDots as CalendarDays, ChartBar as ChartNoAxesColumnIncreasing,
  ClipboardText as ClipboardList, Clock as Clock3, Cloud, Copy,
  DownloadSimple as Download, FileText, Heart, HandHeart as HeartHandshake, House as Home, Info, Leaf, LinkSimple as Link2,
  LockKey as LockKeyhole, ChatCircle as MessageCircle, Moon, MusicNotes as Music2, Notebook as NotebookText, Pause, Phone,
  Pill, Play, Printer, MagnifyingGlass as Search, PaperPlaneTilt as Send,
  GearSix as Settings, ShieldWarning as ShieldAlert, ShieldCheck, SlidersHorizontal, Smiley as Smile, Sparkle as Sparkles,
  Sun, Trash as Trash2, UploadSimple as Upload, User as UserRound, UserMinus as UserRoundX, Users, SpeakerHigh as Volume2,
  SpeakerX as VolumeX, Watch, Waves, Wind, Lightning as Zap,
} from '@phosphor-icons/react';
