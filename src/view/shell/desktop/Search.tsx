import React from 'react'
import {
  ViewStyle,
  TextInput,
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native'
import {useNavigation, StackActions} from '@react-navigation/native'
import {
  AppBskyActorDefs,
  moderateProfile,
  ProfileModeration,
} from '@atproto/api'
import {Trans, msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'

import {s} from '#/lib/styles'
import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {makeProfileLink} from '#/lib/routes/links'
import {Link} from '#/view/com/util/Link'
import {usePalette} from 'lib/hooks/usePalette'
import {MagnifyingGlassIcon2} from 'lib/icons'
import {NavigationProp} from 'lib/routes/types'
import {Text} from 'view/com/util/text/Text'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {useActorAutocompleteFn} from '#/state/queries/actor-autocomplete'
import {useModerationOpts} from '#/state/queries/preferences'

export function SearchResultCard({
  profile,
  style,
  moderation,
}: {
  profile: AppBskyActorDefs.ProfileViewBasic
  style: ViewStyle
  moderation: ProfileModeration
}) {
  const pal = usePalette('default')

  return (
    <Link
      href={makeProfileLink(profile)}
      title={profile.handle}
      asAnchor
      anchorNoUnderline>
      <View
        style={[
          pal.border,
          style,
          {
            borderTopWidth: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 8,
            paddingHorizontal: 12,
          },
        ]}>
        <UserAvatar
          size={40}
          avatar={profile.avatar}
          moderation={moderation.avatar}
        />
        <View style={{flex: 1}}>
          <Text
            type="lg"
            style={[s.bold, pal.text]}
            numberOfLines={1}
            lineHeight={1.2}>
            {sanitizeDisplayName(
              profile.displayName || sanitizeHandle(profile.handle),
              moderation.profile,
            )}
          </Text>
          <Text type="md" style={[pal.textLight]} numberOfLines={1}>
            {sanitizeHandle(profile.handle, '@')}
          </Text>
        </View>
      </View>
    </Link>
  )
}

export function DesktopSearch() {
  const {_} = useLingui()
  const pal = usePalette('default')
  const navigation = useNavigation<NavigationProp>()
  const searchDebounceTimeout = React.useRef<NodeJS.Timeout | undefined>(
    undefined,
  )
  const [isActive, setIsActive] = React.useState<boolean>(false)
  const [isFetching, setIsFetching] = React.useState<boolean>(false)
  const [query, setQuery] = React.useState<string>('')
  const [searchResults, setSearchResults] = React.useState<
    AppBskyActorDefs.ProfileViewBasic[]
  >([])

  const moderationOpts = useModerationOpts()
  const search = useActorAutocompleteFn()

  const onChangeText = React.useCallback(
    async (text: string) => {
      setQuery(text)

      if (text.length > 0) {
        setIsFetching(true)
        setIsActive(true)

        if (searchDebounceTimeout.current)
          clearTimeout(searchDebounceTimeout.current)

        searchDebounceTimeout.current = setTimeout(async () => {
          const results = await search({query: text})

          if (results) {
            setSearchResults(results)
            setIsFetching(false)
          }
        }, 300)
      } else {
        if (searchDebounceTimeout.current)
          clearTimeout(searchDebounceTimeout.current)
        setSearchResults([])
        setIsFetching(false)
        setIsActive(false)
      }
    },
    [setQuery, search, setSearchResults],
  )

  const onPressCancelSearch = React.useCallback(() => {
    setQuery('')
    setIsActive(false)
    if (searchDebounceTimeout.current)
      clearTimeout(searchDebounceTimeout.current)
  }, [setQuery])
  const onSubmit = React.useCallback(() => {
    setIsActive(false)
    if (!query.length) return
    setSearchResults([])
    if (searchDebounceTimeout.current)
      clearTimeout(searchDebounceTimeout.current)
    navigation.dispatch(StackActions.push('Search', {q: query}))
  }, [query, navigation, setSearchResults])

  return (
    <View style={[styles.container, pal.view]}>
      <View
        style={[{backgroundColor: pal.colors.backgroundLight}, styles.search]}>
        <View style={[styles.inputContainer]}>
          <MagnifyingGlassIcon2
            size={18}
            style={[pal.textLight, styles.iconWrapper]}
          />
          <TextInput
            testID="searchTextInput"
            placeholder={_(msg`Search`)}
            placeholderTextColor={pal.colors.textLight}
            selectTextOnFocus
            returnKeyType="search"
            value={query}
            style={[pal.textLight, styles.input]}
            onChangeText={onChangeText}
            onSubmitEditing={onSubmit}
            accessibilityRole="search"
            accessibilityLabel={_(msg`Search`)}
            accessibilityHint=""
          />
          {query ? (
            <View style={styles.cancelBtn}>
              <TouchableOpacity
                onPress={onPressCancelSearch}
                accessibilityRole="button"
                accessibilityLabel={_(msg`Cancel search`)}
                accessibilityHint="Exits inputting search query"
                onAccessibilityEscape={onPressCancelSearch}>
                <Text type="lg" style={[pal.link]}>
                  <Trans>Cancel</Trans>
                </Text>
              </TouchableOpacity>
            </View>
          ) : undefined}
        </View>
      </View>

      {query !== '' && isActive && moderationOpts && (
        <View style={[pal.view, pal.borderDark, styles.resultsContainer]}>
          {isFetching ? (
            <View style={{padding: 8}}>
              <ActivityIndicator />
            </View>
          ) : (
            <>
              {searchResults.length ? (
                searchResults.map((item, i) => (
                  <SearchResultCard
                    key={item.did}
                    profile={item}
                    moderation={moderateProfile(item, moderationOpts)}
                    style={i === 0 ? {borderTopWidth: 0} : {}}
                  />
                ))
              ) : (
                <View>
                  <Text style={[pal.textLight, styles.noResults]}>
                    <Trans>No results found for {query}</Trans>
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: 300,
  },
  search: {
    paddingHorizontal: 16,
    paddingVertical: 2,
    width: 300,
    borderRadius: 20,
  },
  inputContainer: {
    flexDirection: 'row',
  },
  iconWrapper: {
    position: 'relative',
    top: 2,
    paddingVertical: 7,
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 18,
    width: '100%',
    paddingTop: 7,
    paddingBottom: 7,
  },
  cancelBtn: {
    paddingRight: 4,
    paddingLeft: 10,
    paddingVertical: 7,
  },
  resultsContainer: {
    marginTop: 10,
    flexDirection: 'column',
    width: 300,
    borderWidth: 1,
    borderRadius: 6,
  },
  noResults: {
    textAlign: 'center',
    paddingVertical: 10,
  },
})
