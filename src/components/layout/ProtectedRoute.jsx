import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNetworkStore } from "@/stores/useNetworkStore";
import GuestGate from "@/components/GuestGate";

/**
 * Hors ligne sans session, pas de renvoi vers /login : la connexion exige le réseau, et les
 * téléchargements deviendraient inaccessibles.
 */
export default function ProtectedRoute({ children, requireAccount = false, feature }) {
  const session = useAuthStore((s) => s.session);
  const isGuest = !!session?.user?.is_anonymous;
  const offline = useNetworkStore((s) => s.checked && !s.online);

  if (!session && !offline) return <Navigate to="/login" replace />;
  if (requireAccount && isGuest) return <GuestGate feature={feature} />;
  return children;
}
