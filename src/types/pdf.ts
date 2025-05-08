export interface PDFMetadata {
  id: string
  name: string
  path: string
  size: number
  lastModified: string
  pageCount: number
  thumbnail?: string
  coverUrl?: string
}

export interface PDFAnnotation {
  id: string
  pdfId: string
  pageNumber: number
  type: 'highlight' | 'note' | 'drawing'
  content: string
  position: {
    x: number
    y: number
  }
  createdAt: string
  updatedAt: string
}

export interface PDFCache {
  metadata: PDFMetadata
  annotations: PDFAnnotation[]
  lastAccessed: string
} 