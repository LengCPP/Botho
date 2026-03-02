import { googleLogout } from "@react-oauth/google"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import {
  type BodyLoginLoginAccessToken as AccessToken,
  Login,
  type UserPublic,
  type UserRegister,
  Users,
} from "@/client"
import { handleError } from "@/utils"

const isLoggedIn = () => {
  return localStorage.getItem("access_token") !== null
}

const useAuth = () => {
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: user, isError } = useQuery<UserPublic | null, Error>({
    queryKey: ["currentUser"],
    queryFn: () => Users.readUserMe(),
    enabled: isLoggedIn(),
    retry: false,
  })

  useEffect(() => {
    if (isError) {
      logout()
    }
  }, [isError])

  const signUpMutation = useMutation({
    mutationFn: (data: UserRegister) =>
      Users.registerUser({ userRegister: data }),

    onSuccess: (_data, variables) => {
      navigate({
        to: "/signup-success",
        search: { email: variables.email },
      })
    },
    onError: (err: unknown) => {
      handleError(err)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] })
    },
  })

  const login = async (data: AccessToken) => {
    const response = await Login.loginAccessToken({
      bodyLoginLoginAccessToken: data,
    })
    localStorage.setItem("access_token", response.access_token)
  }

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: () => {
      navigate({ to: "/" })
    },
    onError: (err: unknown, variables) => {
      const errDetail = (err as any)?.detail

      if (errDetail === "User not verified") {
        navigate({
          to: "/signup-success",
          search: { email: variables.username },
        })
        return
      }

      if (typeof errDetail === "string") {
        setError(errDetail)
      }
      handleError(err)
    },
  })

  const logout = () => {
    localStorage.removeItem("access_token")
    googleLogout()
    queryClient.clear()
    navigate({ to: "/login" })
  }

  return {
    signUpMutation,
    loginMutation,
    logout,
    user,
    error,
    resetError: () => setError(null),
  }
}

export { isLoggedIn }
export default useAuth
