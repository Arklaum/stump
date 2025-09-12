import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { Easing, Platform, View } from 'react-native'
import { easeGradient } from 'react-native-easing-gradient'
import LinearGradient from 'react-native-linear-gradient'
import Animated, {
	useAnimatedScrollHandler,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ContinueReading, OnDeck, RecentlyAddedBooks } from '~/components/activeServer/home'
import RecentlyAddedSeriesHorizontal from '~/components/activeServer/home/RecentlyAddedSeriesHorizontal'
import RefreshControl from '~/components/RefreshControl'
import { Heading } from '~/components/ui'
import { useColors } from '~/lib/constants'

export default function Screen() {
	const [refreshing, setRefreshing] = useState(false)

	const insets = useSafeAreaInsets()
	const isAtTop = useSharedValue(true)
	const colors = useColors()
	const { colors: gradientColors, locations: gradientLocations } = easeGradient({
		colorStops: {
			0: { color: colors.header.start },
			1: { color: colors.header.end },
		},
		extraColorStopsPerTransition: 16,
		easing: Easing.bezier(0.55, 0, 0.4, 1), // https://cubic-bezier.com/#.55,0,.4,1 e.g. dark mode: stay dark, transition smoothly, then stay transparent
	})

	const scrollHandler = useAnimatedScrollHandler({
		onScroll: (event) => {
			const offset = event.contentOffset.y
			const headingBoundary = (Platform.OS === 'ios' ? -insets.top : 0) + 2

			if (offset > headingBoundary && isAtTop.value) {
				isAtTop.value = false
			} else if (offset <= headingBoundary && !isAtTop.value) {
				isAtTop.value = true
			}
		},
	})

	const headerStyle = useAnimatedStyle(() => {
		return {
			opacity: withTiming(isAtTop.value ? 1 : 0, { duration: 300 }),
		}
	})

	const client = useQueryClient()
	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		await Promise.all([
			client.invalidateQueries({ queryKey: ['continueReading'], exact: false }),
			client.invalidateQueries({ queryKey: ['onDeck'], exact: false }),
			client.invalidateQueries({ queryKey: ['recentlyAddedBooks'], exact: false }),
			client.invalidateQueries({ queryKey: ['recentlyAddedSeries'], exact: false }),
		])
		setRefreshing(false)
	}, [client])

	return (
		<View className="flex-1 bg-background">
			<LinearGradient
				colors={gradientColors}
				locations={gradientLocations}
				style={{
					position: 'absolute',
					top: 0,
					left: 0,
					right: 0,
					height: insets.top + 30,
					zIndex: 5,
				}}
				pointerEvents="none"
			/>
			<Animated.View style={[headerStyle, { position: 'absolute', zIndex: 10 }]}>
				<Heading
					style={{
						fontSize: 36,
						paddingLeft: 16,
						// Without any top padding:
						// On Android: top of text starts at top of screen
						// On iOS: top of text starts 8 pixels higher than top of screen
						paddingTop: insets.top + 10 + (Platform.OS === 'ios' ? 8 : 0),
					}}
				>
					Home
				</Heading>
			</Animated.View>

			<Animated.ScrollView
				onScroll={scrollHandler}
				scrollEventThrottle={16}
				refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
				contentInsetAdjustmentBehavior="always"
				scrollIndicatorInsets={{ top: insets.top }}
			>
				<View
					className="flex flex-1 gap-8 pb-8"
					style={{ paddingTop: (Platform.OS === 'ios' ? 0 : insets.top) + 56 }}
				>
					<ContinueReading />
					<OnDeck />
					<RecentlyAddedSeriesHorizontal />
					<RecentlyAddedBooks />
				</View>
			</Animated.ScrollView>
		</View>
	)
}
