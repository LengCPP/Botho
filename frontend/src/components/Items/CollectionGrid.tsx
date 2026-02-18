import { SimpleGrid } from "@chakra-ui/react"
import { GroupCard } from "./GroupCard"

export interface CollectionItem {
  name: string
  count: number
  item_type?: string
  sample_images?: string[]
  sample_image?: string | null
}

interface CollectionGridProps {
  items: CollectionItem[]
  type: string
  onOpen: (name: string) => void
}

export function CollectionGrid({ items, type, onOpen }: CollectionGridProps) {
  return (
    <SimpleGrid columns={{ base: 1, md: 2, lg: 3, xl: 4 }} gap={6}>
      {items.map((item) => (
        <GroupCard
          key={`${item.name}-${item.item_type || "default"}`}
          name={item.name}
          type={type}
          item_type={item.item_type}
          count={item.count}
          sample_image={item.sample_image}
          sample_images={item.sample_images}
          onOpen={() => onOpen(item.name)}
        />
      ))}
    </SimpleGrid>
  )
}
