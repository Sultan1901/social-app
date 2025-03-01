import React, {useState, useMemo} from 'react'
import {StyleProp, StyleSheet, View, ViewStyle} from 'react-native'
import {
  AppBskyFeedDefs,
  AppBskyFeedPost,
  AtUri,
  moderatePost,
  PostModeration,
  RichText as RichTextAPI,
} from '@atproto/api'
import {FontAwesomeIcon} from '@fortawesome/react-native-fontawesome'
import {Link, TextLink} from '../util/Link'
import {UserInfoText} from '../util/UserInfoText'
import {PostMeta} from '../util/PostMeta'
import {PostEmbeds} from '../util/post-embeds'
import {PostCtrls} from '../util/post-ctrls/PostCtrls'
import {ContentHider} from '../util/moderation/ContentHider'
import {PostAlerts} from '../util/moderation/PostAlerts'
import {Text} from '../util/text/Text'
import {RichText} from '../util/text/RichText'
import {PreviewableUserAvatar} from '../util/UserAvatar'
import {s, colors} from 'lib/styles'
import {usePalette} from 'lib/hooks/usePalette'
import {makeProfileLink} from 'lib/routes/links'
import {MAX_POST_LINES} from 'lib/constants'
import {countLines} from 'lib/strings/helpers'
import {useModerationOpts} from '#/state/queries/preferences'
import {useComposerControls} from '#/state/shell/composer'
import {Shadow, usePostShadow, POST_TOMBSTONE} from '#/state/cache/post-shadow'

export function Post({
  post,
  showReplyLine,
  style,
}: {
  post: AppBskyFeedDefs.PostView
  showReplyLine?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const moderationOpts = useModerationOpts()
  const record = useMemo<AppBskyFeedPost.Record | undefined>(
    () =>
      AppBskyFeedPost.isRecord(post.record) &&
      AppBskyFeedPost.validateRecord(post.record).success
        ? post.record
        : undefined,
    [post],
  )
  const postShadowed = usePostShadow(post)
  const richText = useMemo(
    () =>
      record
        ? new RichTextAPI({
            text: record.text,
            facets: record.facets,
          })
        : undefined,
    [record],
  )
  const moderation = useMemo(
    () => (moderationOpts ? moderatePost(post, moderationOpts) : undefined),
    [moderationOpts, post],
  )
  if (postShadowed === POST_TOMBSTONE) {
    return null
  }
  if (record && richText && moderation) {
    return (
      <PostInner
        post={postShadowed}
        record={record}
        richText={richText}
        moderation={moderation}
        showReplyLine={showReplyLine}
        style={style}
      />
    )
  }
  return null
}

function PostInner({
  post,
  record,
  richText,
  moderation,
  showReplyLine,
  style,
}: {
  post: Shadow<AppBskyFeedDefs.PostView>
  record: AppBskyFeedPost.Record
  richText: RichTextAPI
  moderation: PostModeration
  showReplyLine?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const pal = usePalette('default')
  const {openComposer} = useComposerControls()
  const [limitLines, setLimitLines] = useState(
    () => countLines(richText?.text) >= MAX_POST_LINES,
  )
  const itemUrip = new AtUri(post.uri)
  const itemHref = makeProfileLink(post.author, 'post', itemUrip.rkey)
  let replyAuthorDid = ''
  if (record.reply) {
    const urip = new AtUri(record.reply.parent?.uri || record.reply.root.uri)
    replyAuthorDid = urip.hostname
  }

  const onPressReply = React.useCallback(() => {
    openComposer({
      replyTo: {
        uri: post.uri,
        cid: post.cid,
        text: record.text,
        author: {
          handle: post.author.handle,
          displayName: post.author.displayName,
          avatar: post.author.avatar,
        },
      },
    })
  }, [openComposer, post, record])

  const onPressShowMore = React.useCallback(() => {
    setLimitLines(false)
  }, [setLimitLines])

  return (
    <Link href={itemHref} style={[styles.outer, pal.view, pal.border, style]}>
      {showReplyLine && <View style={styles.replyLine} />}
      <View style={styles.layout}>
        <View style={styles.layoutAvi}>
          <PreviewableUserAvatar
            size={52}
            did={post.author.did}
            handle={post.author.handle}
            avatar={post.author.avatar}
            moderation={moderation.avatar}
          />
        </View>
        <View style={styles.layoutContent}>
          <PostMeta
            author={post.author}
            authorHasWarning={!!post.author.labels?.length}
            timestamp={post.indexedAt}
            postHref={itemHref}
          />
          {replyAuthorDid !== '' && (
            <View style={[s.flexRow, s.mb2, s.alignCenter]}>
              <FontAwesomeIcon
                icon="reply"
                size={9}
                style={[pal.textLight, s.mr5]}
              />
              <Text
                type="sm"
                style={[pal.textLight, s.mr2]}
                lineHeight={1.2}
                numberOfLines={1}>
                Reply to{' '}
                <UserInfoText
                  type="sm"
                  did={replyAuthorDid}
                  attr="displayName"
                  style={[pal.textLight]}
                />
              </Text>
            </View>
          )}
          <ContentHider
            moderation={moderation.content}
            style={styles.contentHider}
            childContainerStyle={styles.contentHiderChild}>
            <PostAlerts moderation={moderation.content} style={styles.alert} />
            {richText.text ? (
              <View style={styles.postTextContainer}>
                <RichText
                  testID="postText"
                  type="post-text"
                  richText={richText}
                  lineHeight={1.3}
                  numberOfLines={limitLines ? MAX_POST_LINES : undefined}
                  style={s.flex1}
                />
              </View>
            ) : undefined}
            {limitLines ? (
              <TextLink
                text="Show More"
                style={pal.link}
                onPress={onPressShowMore}
                href="#"
              />
            ) : undefined}
            {post.embed ? (
              <ContentHider
                moderation={moderation.embed}
                style={styles.contentHider}>
                <PostEmbeds embed={post.embed} moderation={moderation.embed} />
              </ContentHider>
            ) : null}
          </ContentHider>
          <PostCtrls post={post} record={record} onPressReply={onPressReply} />
        </View>
      </View>
    </Link>
  )
}

const styles = StyleSheet.create({
  outer: {
    paddingTop: 10,
    paddingRight: 15,
    paddingBottom: 5,
    paddingLeft: 10,
    borderTopWidth: 1,
    cursor: 'pointer',
  },
  layout: {
    flexDirection: 'row',
  },
  layoutAvi: {
    width: 70,
    paddingLeft: 8,
  },
  layoutContent: {
    flex: 1,
  },
  alert: {
    marginBottom: 6,
  },
  postTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  replyLine: {
    position: 'absolute',
    left: 36,
    top: 70,
    bottom: 0,
    borderLeftWidth: 2,
    borderLeftColor: colors.gray2,
  },
  contentHider: {
    marginBottom: 2,
  },
  contentHiderChild: {
    marginTop: 6,
  },
})
