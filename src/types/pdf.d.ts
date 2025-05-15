export interface PDFMetadata {
  id: string
  name: string
  path: string
  size: number
  lastModified: string
  pageCount: number
  thumbnail: string
  coverUrl: string
}

export interface PDFAnnotation {
  id: string
  pageNumber: number
  content: string
  type: 'highlight' | 'note' | 'bookmark'
  position?: {
    x: number
    y: number
    width: number
    height: number
  }
  createdAt: string
  updatedAt: string
}

export interface ReadingProgress {
  scrollTop: number
  zoom: number
  currentPage: number
  lastUpdated: string
}

export interface PDFCache {
  metadata: PDFMetadata
  annotations: PDFAnnotation[]
  lastAccessed: string
  readingProgress?: ReadingProgress
} 