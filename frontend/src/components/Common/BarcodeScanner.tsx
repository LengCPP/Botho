import {
  Box,
  Button,
  Flex,
  HStack,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react"
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode"
import { useCallback, useEffect, useRef, useState } from "react"
import { FiAlertCircle, FiX } from "react-icons/fi"

interface BarcodeScannerProps {
  onScan: (decodedText: string) => void
  onClose: () => void
}

const BarcodeScanner = ({ onScan, onClose }: BarcodeScannerProps) => {
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isStopping = useRef(false)

  const stopScanner = async () => {
    if (isStopping.current) return
    isStopping.current = true

    try {
      if (scannerRef.current) {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop()
        }
        // clear() is important to remove the video element and avoid DOM leaks
        await scannerRef.current.clear()
      }
    } catch (err) {
      console.error("Error stopping scanner:", err)
    } finally {
      setIsScanning(false)
      onClose()
    }
  }

  const startScanner = useCallback(async () => {
    if (!containerRef.current) return

    try {
      if (!window.isSecureContext) {
        throw new Error("Camera access requires a secure connection (HTTPS).")
      }

      // Initialize scanner instance if not exists
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(containerRef.current.id, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
          ],
          verbose: false,
        })
      }

      setError(null)

      await scannerRef.current.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 150 },
        },
        async (decodedText) => {
          // Success: Stop scanner then notify parent
          if (scannerRef.current?.isScanning) {
            await scannerRef.current.stop()
            await scannerRef.current.clear()
          }
          onScan(decodedText)
        },
        () => {
          // Failure callback, silent per-frame
        },
      )
      setIsScanning(true)
    } catch (err: any) {
      console.error("Failed to start scanner:", err)
      const message = err?.message || String(err)
      if (message.includes("Permission denied")) {
        setError("Camera permission denied. Please allow camera access.")
      } else if (
        message.includes("NotFoundErr") ||
        message.includes("no device")
      ) {
        setError("No camera found on this device.")
      } else {
        setError(message)
      }
      setIsScanning(false)
    }
  }, [onScan])

  useEffect(() => {
    const timer = setTimeout(() => {
      startScanner()
    }, 200)

    return () => {
      clearTimeout(timer)
      // Cleanup on unmount
      if (scannerRef.current?.isScanning) {
        scannerRef.current
          .stop()
          .then(() => scannerRef.current?.clear())
          .catch(console.error)
      }
    }
  }, [startScanner])

  return (
    <VStack gap={4} width="100%" py={4}>
      <Box
        position="relative"
        width="100%"
        maxW="400px"
        aspectRatio="4/3"
        bg="black"
        borderRadius="md"
        overflow="hidden"
        border="2px solid"
        borderColor={error ? "red.500" : "border.subtle"}
      >
        {/* html5-qrcode targets this ID. We keep it stable. */}
        <div
          id="barcode-scanner-viewport"
          ref={containerRef}
          style={{ width: "100%", height: "100%" }}
        />

        {/* Overlays */}
        {!isScanning && !error && (
          <Flex
            position="absolute"
            inset={0}
            align="center"
            justify="center"
            direction="column"
            color="white"
            bg="black"
            zIndex={1}
          >
            <Spinner mb={4} />
            <Text fontSize="sm">Initializing camera...</Text>
          </Flex>
        )}

        {error && (
          <Flex
            position="absolute"
            inset={0}
            align="center"
            justify="center"
            direction="column"
            color="white"
            p={6}
            textAlign="center"
            bg="black"
            zIndex={2}
          >
            <FiAlertCircle size="32px" color="#E53E3E" />
            <Text mt={4} fontSize="sm" fontWeight="bold">
              Camera Error
            </Text>
            <Text mt={2} fontSize="xs" color="gray.300">
              {error}
            </Text>
            <Button size="xs" mt={4} onClick={startScanner} colorPalette="teal">
              Retry
            </Button>
          </Flex>
        )}
      </Box>
      <HStack>
        <Button
          size="sm"
          colorPalette="red"
          variant="outline"
          onClick={stopScanner}
        >
          <FiX /> Close Scanner
        </Button>
      </HStack>
    </VStack>
  )
}

export default BarcodeScanner
