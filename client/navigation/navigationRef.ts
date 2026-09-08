import { createNavigationContainerRef } from "@react-navigation/native";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

/**
 * Container-level navigation ref for components that live outside the
 * navigator tree (e.g. the milestone celebration modal mounted in App).
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
