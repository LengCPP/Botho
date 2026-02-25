import { useQuery } from "@tanstack/react-query"
import { ItemTypesService, type ItemTypeDefinitionPublic } from "@/client"

export type { ItemTypeDefinitionPublic as ItemTypeDefinition }

export function useItemTypeDefinitions() {
  const { data, isLoading } = useQuery({
    queryKey: ["item-type-definitions"],
    queryFn: () => ItemTypesService.listItemTypes(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  return {
    definitions: data?.data ?? [],
    isLoading,
  }
}
