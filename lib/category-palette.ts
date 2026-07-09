export const CATEGORY_PALETTES: Record<string, { primary: string; secondary: string; accent: string }> = {
  "Mind & Body":       { primary: "#007E7A", secondary: "#87CEEB", accent: "#F4C430" },
  "Beauty & Skincare": { primary: "#E8A0BF", secondary: "#F5D5E0", accent: "#FFFDF7" },
  "Wellness":          { primary: "#4CAF50", secondary: "#98FF98", accent: "#9DC183" },
  "Style & Shopping":  { primary: "#B39DDB", secondary: "#CE93D8", accent: "#FFFDD0" },
  "Entertainment":     { primary: "#FF7F50", secondary: "#FFD700", accent: "#FFDAB9" },
  "Relationship":      { primary: "#FFDAB9", secondary: "#CD853F", accent: "#F5F5DC" },
  "Level Up & Career": { primary: "#191970", secondary: "#4169E1", accent: "#FFD700" },
  "Creative Space":    { primary: "#C8A2C8", secondary: "#4B0082", accent: "#FFFDF7" },
  "Tech & Gaming":     { primary: "#00FFFF", secondary: "#00004D", accent: "#C0C0C0" },
  "Cerita Pembaca":    { primary: "#F5DEB3", secondary: "#6F4E37", accent: "#FFFDD0" },
}

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Mind & Body":       ["mind", "body", "mental", "kesehatan mental", "meditasi", "healing"],
  "Beauty & Skincare": ["beauty", "skincare", "makeup", "glowing", "skin", "kecantikan"],
  "Wellness":          ["wellness", "health", "sehat", "diet", "nutrisi", "fitness", "olahraga"],
  "Style & Shopping":  ["style", "fashion", "shopping", "ootd", "baju", "outfit"],
  "Entertainment":     ["entertainment", "film", "movie", "music", "musik", "kpop", "anime", "drama"],
  "Relationship":      ["relationship", "love", "cinta", "dating", "hubungan", "pasangan"],
  "Level Up & Career": ["career", "karir", "bisnis", "business", "money", "finance", "keuangan", "kerja"],
  "Creative Space":    ["creative", "art", "design", "seni", "writing", "tulis", "fotografi"],
  "Tech & Gaming":     ["tech", "gaming", "game", "ai", "artificial intelligence", "coding", "startup", "gadget", "teknologi"],
  "Cerita Pembaca":    ["cerita", "story", "pengalaman", "confession", "curhat"],
}
