import { ItemsService } from "@/client"
import { useQuery } from "@tanstack/react-query"

export interface BookResult {
  title: string
  authors: string[]
  description: string
  isbn: string
  thumbnail: string
  categories: string[]
}

const FALLBACK_BOOK_COVER =
  "https://via.placeholder.com/400x600?text=No+Cover+Available"

const fetchBooks = async (
  query: string,
  searchType: "intitle" | "isbn" = "intitle",
) => {
  if (!query || query.length < 3) return []

  // Local Registry Check first for ISBN
  if (searchType === "isbn") {
    try {
      const localBook = await ItemsService.lookupBookRegistry({ isbn: query })
      if (localBook) {
        return [
          {
            title: localBook.title,
            authors: [localBook.author],
            description: localBook.description || "",
            isbn: localBook.isbn || query,
            thumbnail: localBook.image_url || FALLBACK_BOOK_COVER,
            categories: localBook.category ? [localBook.category] : [],
          },
        ]
      }
    } catch (e) {
      // Not in local registry, continue to Google API
    }
  }

  const apiKey = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY
  const searchPrefix = searchType === "isbn" ? "isbn:" : "intitle:"
  const url = `https://www.googleapis.com/books/v1/volumes?q=${searchPrefix}${encodeURIComponent(
    query,
  )}&maxResults=5&printType=books${apiKey ? `&key=${apiKey}` : ""}`

  const response = await fetch(url)
  if (!response.ok) throw new Error("Failed to fetch books")
  const data = await response.json()

  return (data.items || []).map((item: any) => {
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
    }
  }) as BookResult[]
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
