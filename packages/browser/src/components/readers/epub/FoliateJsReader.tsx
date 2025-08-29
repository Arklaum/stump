import {
	BookPreferences,
	queryClient,
	useGraphQLMutation,
	useSDK,
	useSuspenseGraphQL,
} from '@stump/client'
import {
	Bookmark,
	EpubJsReaderQuery,
	EpubProgressInput,
	graphql,
	ReadingMode,
} from '@stump/graphql'
import { useQueryClient } from '@tanstack/react-query'

import uniqby from 'lodash/uniqBy'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AutoSizer from 'react-virtualized-auto-sizer'
import { toast } from 'sonner'

import Spinner from '@/components/Spinner'
import { useTheme } from '@/hooks'
import { useBookPreferences } from '@/scenes/book/reader/useBookPreferences'

import EpubReaderContainer from './EpubReaderContainer'
import { applyTheme, stumpDark, themeToCss } from './themes'

import('../../../vendor/foliate-js/view.js')
import type { View } from '../../../vendor/foliate-js/view.js'
import { current } from 'immer'

/** The props for the FoliateJsReader component */
type FoliateJsReaderProps = {
	/** The ID of the associated media entity for this epub */
	id: string
	/** If true, starts progress at the start of the book, or the default location if set */
	isIncognito: boolean
}

export default function FoliateJsReader({ id, isIncognito }: FoliateJsReaderProps) {
	// Things
	const {
		data: { epubById: ebook },
	} = useSuspenseGraphQL(query, ['epubJsReader', id], { id: id || '' })
	const { sdk } = useSDK()
	const { theme } = useTheme()
	const { bookPreferences } = useBookPreferences({ book: ebook.media })
	const client = useQueryClient()
	const { mutate } = useGraphQLMutation(mutation, {
		onSuccess: ({ updateMediaProgress: data }) => {
			client.setQueryData(['epubJsReader', id], (prevData: EpubJsReaderQuery) => {
				if (!prevData) return prevData

				return {
					...prevData,
					epubById: {
						...prevData.epubById,
						media: {
							...prevData.epubById.media,
							readProgress: data.__typename === 'ActiveReadingSession' ? data : null,
						},
					},
				}
			})
		},
	})
	const targetCfi = ebook.media?.readProgress?.epubcfi

	const updateProgress = useCallback(
		(input: EpubProgressInput) => {
			if (isIncognito) return

			mutate({
				id: ebook.media?.id || '',
				input: {
					epub: input,
				},
			})
		},
		[mutate, ebook, isIncognito],
	)
	// Things end

	// Book Data
	const [existingBookmarks, setExistingBookmarks] = useState<Record<string, Bookmark>>({})
	const [sectionLengths, setSectionLengths] = useState({})
	const [cfiR, setCfiR] = useState<[string | undefined, string | undefined]>([undefined, undefined])
	const [chapterName, setChapterName] = useState<string>()
	const [sectionIndex, setSectionIndex] = useState<number>()
	const [chapter, setChapter] = useState<number | undefined>()
	const [currentPage, setCurrentPage] = useState<number>()
	const [totalPages, setTotalPages] = useState(0)
	const [currentCfi, setCurrentCfi] = useState<string | null>(targetCfi || null)
	const [fraction, setFraction] = useState<number>(0)

	// Create the view object + only show once fully loaded
	// or else text flickers once due to goTo(initialCfi)
	const [view, setView] = useState<View | null>(null)
	const [showView, setShowView] = useState(false)

	// Use the view object once <foliate-view> is mounted to the DOM.
	const viewRefCallback = useCallback((node: View | null) => {
		if (node) setView(node)
	}, [])

	// Style setter
	const setStyles = (view: View | null) => {
		if (!view || !view.renderer) return
		const baseTheme = theme === 'dark' ? stumpDark : {}
		const themeObject = applyTheme(baseTheme, bookPreferences)
		const cssString = themeToCss(themeObject)
		// @ts-expect-error
		view.renderer.setStyles?.(cssString)
	}

	// @ts-expect-error
	const loadHandler = (e) => {
		const language = view?.language?.locale?.language // Firefox has issues with detecting reading direction. This is a workaround.
		if (language === 'ja' || language === 'cn') {
			e.detail.doc.documentElement.style.writingMode = 'vertical-rl'
		}
		setTimeout(() => setShowView(true), 50)
	}

	// @ts-expect-error
	const relocateHandler = (e) => {
		// Get the info
		const chapterName = e.detail.tocItem?.label
		const paginator = view?.renderer as any // issue
		const currentPage = paginator.page
		const totalPages = paginator.pages - 2 // includes header and footer pages so reduce by 2.
		const sectionLengths = view?.getSectionFractions()
		const sectionIndex = view?.lastLocation.section.current + 1 // idk

		// Set the info
		setChapterName(chapterName)
		setChapter(sectionIndex)
		setCurrentPage(currentPage)
		setTotalPages(totalPages)
		setSectionLengths(sectionLengths)
		setSectionIndex(sectionIndex)

		// Save position
		const fraction = e.detail.fraction
		const currentCfi = e.detail.cfi
		setFraction(fraction)
		setCurrentCfi(currentCfi)

		// Update Progress
		updateProgress({
			epubcfi: currentCfi,
			percentage: fraction,
			isComplete: fraction > 0.95,
		})
	}

	// Load in the book
	useEffect(() => {
		if (!view || !ebook) return

		const loadBook = async (view: View, id: string) => {
			// Open the book file
			const downloadUrl = sdk.media.downloadURL(id)
			const response = await fetch(downloadUrl, { credentials: 'include' })
			if (!response.ok) throw new Error(`Failed to fetch ebook: ${response.status}`)
			const blob = await response.blob()
			const blobUrl = URL.createObjectURL(blob)
			console.log(blobUrl)
			await view.open(blobUrl)

			// set style + location up
			setStyles(view)
			console.log('cfi:', currentCfi)
			if (currentCfi !== null) {
				view.goTo(currentCfi)
			} else {
				view.next()
			}

			view.addEventListener('load', loadHandler)
			view.addEventListener('relocate', relocateHandler)
		}

		loadBook(view, id)

		return () => {
			if (view) {
				view.removeEventListener('load', loadHandler)
				view.removeEventListener('relocate', relocateHandler)
				view.close()
			}
		}
	}, [view, id, sdk])

	// Dynamic style setting
	useEffect(() => {
		setStyles(view)
	}, [view, theme, bookPreferences])

	// Controls
	const onPaginateForward = useCallback(() => view?.goRight(), [view])
	const onPaginateBackward = useCallback(() => view?.goLeft(), [view])

	if (!ebook || !ebook.media) return null

	const toc = parseToc(ebook.toc)

	return (
		<EpubReaderContainer
			readerMeta={{
				bookEntity: ebook.media,
				bookMeta: {
					chapter: {
						name: chapterName,
						currentPage: currentPage,
						totalPages: totalPages,

						cfiRange: cfiR,
						sectionSpineIndex: sectionIndex,
						position: chapter,
					},
					toc: toc,
					sectionLengths: sectionLengths,
					bookmarks: existingBookmarks,
				},
				progress: ebook.media.readProgress?.percentageCompleted || null,
			}}
			controls={{
				//getCfiPreviewText,
				//onGoToCfi,
				//onLinkClick,
				onPaginateBackward,
				onPaginateForward,
				//jumpToSection,
				//searchEntireBook,
			}}
		>
			<div className="h-full w-full" style={{ visibility: showView ? 'visible' : 'hidden' }}>
				{/* @ts-expect-error */}
				<foliate-view key={ebook.media.id} ref={viewRefCallback} />
			</div>
		</EpubReaderContainer>
	)
}

const query = graphql(`
	query EpubJsReader($id: ID!) {
		epubById(id: $id) {
			mediaId
			rootBase
			rootFile
			extraCss
			toc
			resources
			metadata
			spine {
				id
				idref
				properties
				linear
			}
			bookmarks {
				id
				userId
				epubcfi
				mediaId
			}
			media {
				id
				resolvedName
				pages
				extension
				readProgress {
					percentageCompleted
					epubcfi
					page
					elapsedSeconds
				}
				libraryConfig {
					defaultReadingImageScaleFit
					defaultReadingMode
					defaultReadingDir
				}
			}
		}
	}
`)

const mutation = graphql(`
	mutation UpdateEpubProgress($id: ID!, $input: MediaProgressInput!) {
		updateMediaProgress(id: $id, input: $input) {
			__typename
			... on ActiveReadingSession {
				percentageCompleted
				epubcfi
				page
				elapsedSeconds
			}
		}
	}
`)

interface EpubContent {
	label: string
	content: string
	children: EpubContent[]
	play_order: number
}

function parseToc(toc: EpubJsReaderQuery['epubById']['toc']): EpubContent[] {
	if (!toc) return []

	// epub toc is an array of json strings of EpubContent, so we need to parse them
	const parsedToc = toc
		.map((item) => {
			try {
				return JSON.parse(item) as EpubContent
			} catch (e) {
				console.error('Failed to parse toc item', item, e)
				return null
			}
		})
		.filter((item) => item !== null) as EpubContent[]

	return parsedToc
}
