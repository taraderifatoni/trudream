export type SlideType = 'cover' | 'profile' | 'bullets' | 'stat' | 'grid4' | 'quote' | 'cta' | 'screenshot'

export interface SlideContent {
  type: SlideType
  tag: string
  title?: string
  subtitle?: string
  bullets?: string[]
  stats?: { value: string; label: string }[]
  cards?: { num: string; title: string; desc: string }[]
  quote?: string
  source?: string
  text?: string
  imagePrompt: string
  imagePath?: string
  imageUrl?: string
  layout?: string
  imagePosition?: string
  imagePercent?: number
}

export interface VideoSlide {
  type: 'video'
  localPath: string
  publicUrl: string
  durationSeconds: number
}

export type AnySlide = SlideContent | VideoSlide

export interface GenerateResult {
  slides: AnySlide[]
  caption: string
  tag: string
}
