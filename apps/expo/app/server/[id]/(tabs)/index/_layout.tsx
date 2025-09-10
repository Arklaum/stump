import { Stack } from 'expo-router'
import { Platform } from 'react-native'

import { usePreferencesStore } from '~/stores'

export default function Layout() {
	const animationEnabled = usePreferencesStore((state) => !state.reduceAnimations)

	return (
		<Stack screenOptions={{ headerShown: false }}>
			<Stack.Screen
				name="index"
				options={{
					headerShown: false,
					headerTitle: 'Home',
					headerTransparent: Platform.OS === 'ios',
					headerLargeTitleStyle: {
						fontSize: 30,
					},
					headerLargeTitle: true,
					headerBlurEffect: 'regular',
					animation: animationEnabled ? 'default' : 'none',
				}}
			/>
		</Stack>
	)
}
