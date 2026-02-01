import { ItemsService } from "@/client"
import { useQuery } from "@tanstack/react-query"

export interface BookResult {
  title: string
  authors: string[]
  description: string
  isbn: string
  thumbnail: string
  categories: string[]
  source?: "local" | "google"
}

const FALLBACK_BOOK_COVER =
  "https://via.placeholder.com/400x600?text=No+Cover+Available"

const fetchBooks = async (
  query: string,
  searchType: "intitle" | "isbn" = "intitle",
) => {
  if (!query || query.length < 3) return []

  const localResults: BookResult[] = []

  // Local Registry Check first
  try {
    if (searchType === "isbn") {
      const localBook = await ItemsService.lookupBookRegistry({ isbn: query })
      if (localBook) {
        localResults.push({
          title: localBook.title,
          authors: [localBook.author],
          description: localBook.description || "",
          isbn: localBook.isbn || query,
          thumbnail: localBook.image_url || FALLBACK_BOOK_COVER,
          categories: localBook.category ? [localBook.category] : [],
          source: "local",
        })
      }
    } else {
      const results = await ItemsService.searchBookRegistry({ q: query, limit: 5 })
      for (const b of results) {
        localResults.push({
          title: b.title,
          authors: [b.author],
          description: b.description || "",
          isbn: b.isbn || "",
          thumbnail: b.image_url || FALLBACK_BOOK_COVER,
          categories: b.category ? [b.category] : [],
          source: "local",
        })
      }
    }
  } catch (e) {
    console.error("Local search failed", e)
  }

  // If we have local results for ISBN, return them immediately to avoid Google hit
  if (searchType === "isbn" && localResults.length > 0) {
    return localResults
  }

  // Google API Call
  const apiKey = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY
  const searchPrefix = searchType === "isbn" ? "isbn:" : "intitle:"
  const url = `https://www.googleapis.com/books/v1/volumes?q=${searchPrefix}${encodeURIComponent(
    query,
  )}&maxResults=5&printType=books${apiKey ? `&key=${apiKey}` : ""}`

  const response = await fetch(url)
  if (!response.ok) throw new Error("Failed to fetch books")
  const data = await response.json()

  const googleResults = (data.items || []).map((item: any) => {
    const volumeInfo = item.volumeInfo
    const isbns = volumeInfo.industryIdentifiers || []
    const isbn13 = isbns.find((id: any) => id.type === "ISBN_13")?.identifier
    const isbn10 = isbns.find((id: any) => id.type === "ISBN_10")?.identifier

    const imageLinks = volumeInfo.imageLinks
    let thumbnail =
      imageLinks?.medium ||
      imageLinks?.small ||
      imageLinks?.smallThumbnail ||
      FALLBACK_BOOK_COVER

    if (thumbnail && thumbnail !== FALLBACK_BOOK_COVER) {
      thumbnail = thumbnail
        .replace("http://", "https://")
        .replace("zoom=1", "zoom=2")
        .replace("&edge=curl", "")
    }

    return {
      title: volumeInfo.title,
      authors: volumeInfo.authors || [],
      description: volumeInfo.description || "",
      isbn: isbn13 || isbn10 || "",
      thumbnail: thumbnail,
      categories: volumeInfo.categories || [],
      source: "google",
    }
  }) as BookResult[]

  // De-duplicate: Prefer local over Google if ISBN matches
  const combined = [...localResults]
  const localIsbns = new Set(localResults.map(r => r.isbn).filter(i => i))
  
  for (const g of googleResults) {
    if (!g.isbn || !localIsbns.has(g.isbn)) {
      combined.push(g)
    }
  }

  return combined
}

export const useBookSearch = (query: string) => {
  return useQuery({
    queryKey: ["bookSearch", query],
    queryFn: () => fetchBooks(query, "intitle"),
    enabled: query.length >= 3,
  })
}

export const useIsbnSearch = (isbn: string) => {
  return useQuery({
    queryKey: ["isbnSearch", isbn],
    queryFn: () => fetchBooks(isbn, "isbn"),
    enabled: isbn.length >= 10,
  })
}
