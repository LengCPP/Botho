import { Box, HStack } from "@chakra-ui/react"
import { FaRegStar, FaStar, FaStarHalfAlt } from "react-icons/fa"

interface RatingProps {
  value: number
  max?: number
  size?: number
  color?: string
  onChange?: (value: number) => void
  readOnly?: boolean
}

export const Rating = ({
  value,
  max = 5,
  size = 14,
  color = "#fb6635",
  onChange,
  readOnly = true,
}: RatingProps) => {
  return (
    <HStack gap={1} display="inline-flex" alignItems="center">
      {Array.from({ length: max }).map((_, index) => {
        const starValue = index + 1
        return (
          <Box
            key={index}
            color={color}
            fontSize={`${size}px`}
            lineHeight={1}
            cursor={readOnly ? "default" : "pointer"}
            onClick={() => !readOnly && onChange?.(starValue)}
            transition="transform 0.1s"
            _hover={!readOnly ? { transform: "scale(1.2)" } : {}}
          >
            {value >= starValue ? (
              <FaStar />
            ) : value >= starValue - 0.5 ? (
              <FaStarHalfAlt />
            ) : (
              <FaRegStar />
            )}
          </Box>
        )
      })}
    </HStack>
  )
}
