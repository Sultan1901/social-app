import {
  AppBskyFeedDefs,
  AppBskyFeedPost,
  AppBskyFeedGetPostThread,
} from '@atproto/api'
import {useQuery, useQueryClient, QueryClient} from '@tanstack/react-query'

import {getAgent} from '#/state/session'
import {UsePreferencesQueryResponse} from '#/state/queries/preferences/types'
import {findPostInQueryData as findPostInFeedQueryData} from './post-feed'
import {findPostInQueryData as findPostInNotifsQueryData} from './notifications/feed'
import {precacheThreadPosts as precacheResolvedUris} from './resolve-uri'

export const RQKEY = (uri: string) => ['post-thread', uri]
type ThreadViewNode = AppBskyFeedGetPostThread.OutputSchema['thread']

export interface ThreadCtx {
  depth: number
  isHighlightedPost?: boolean
  hasMore?: boolean
  showChildReplyLine?: boolean
  showParentReplyLine?: boolean
  isParentLoading?: boolean
  isChildLoading?: boolean
}

export type ThreadPost = {
  type: 'post'
  _reactKey: string
  uri: string
  post: AppBskyFeedDefs.PostView
  record: AppBskyFeedPost.Record
  parent?: ThreadNode
  replies?: ThreadNode[]
  viewer?: AppBskyFeedDefs.ViewerThreadState
  ctx: ThreadCtx
}

export type ThreadNotFound = {
  type: 'not-found'
  _reactKey: string
  uri: string
  ctx: ThreadCtx
}

export type ThreadBlocked = {
  type: 'blocked'
  _reactKey: string
  uri: string
  ctx: ThreadCtx
}

export type ThreadUnknown = {
  type: 'unknown'
  uri: string
}

export type ThreadNode =
  | ThreadPost
  | ThreadNotFound
  | ThreadBlocked
  | ThreadUnknown

export function usePostThreadQuery(uri: string | undefined) {
  const queryClient = useQueryClient()
  return useQuery<ThreadNode, Error>({
    queryKey: RQKEY(uri || ''),
    async queryFn() {
      const res = await getAgent().getPostThread({uri: uri!})
      if (res.success) {
        const nodes = responseToThreadNodes(res.data.thread)
        precacheResolvedUris(queryClient, nodes) // precache the handle->did resolution
        return nodes
      }
      return {type: 'unknown', uri: uri!}
    },
    enabled: !!uri,
    placeholderData: () => {
      if (!uri) {
        return undefined
      }
      {
        const item = findPostInQueryData(queryClient, uri)
        if (item) {
          return threadNodeToPlaceholderThread(item)
        }
      }
      {
        const item = findPostInFeedQueryData(queryClient, uri)
        if (item) {
          return feedViewPostToPlaceholderThread(item)
        }
      }
      {
        const item = findPostInNotifsQueryData(queryClient, uri)
        if (item) {
          return postViewToPlaceholderThread(item)
        }
      }
      return undefined
    },
  })
}

export function sortThread(
  node: ThreadNode,
  opts: UsePreferencesQueryResponse['threadViewPrefs'],
): ThreadNode {
  if (node.type !== 'post') {
    return node
  }
  if (node.replies) {
    node.replies.sort((a: ThreadNode, b: ThreadNode) => {
      if (a.type !== 'post') {
        return 1
      }
      if (b.type !== 'post') {
        return -1
      }

      const aIsByOp = a.post.author.did === node.post?.author.did
      const bIsByOp = b.post.author.did === node.post?.author.did
      if (aIsByOp && bIsByOp) {
        return a.post.indexedAt.localeCompare(b.post.indexedAt) // oldest
      } else if (aIsByOp) {
        return -1 // op's own reply
      } else if (bIsByOp) {
        return 1 // op's own reply
      }
      if (opts.prioritizeFollowedUsers) {
        const af = a.post.author.viewer?.following
        const bf = b.post.author.viewer?.following
        if (af && !bf) {
          return -1
        } else if (!af && bf) {
          return 1
        }
      }
      if (opts.sort === 'oldest') {
        return a.post.indexedAt.localeCompare(b.post.indexedAt)
      } else if (opts.sort === 'newest') {
        return b.post.indexedAt.localeCompare(a.post.indexedAt)
      } else if (opts.sort === 'most-likes') {
        if (a.post.likeCount === b.post.likeCount) {
          return b.post.indexedAt.localeCompare(a.post.indexedAt) // newest
        } else {
          return (b.post.likeCount || 0) - (a.post.likeCount || 0) // most likes
        }
      } else if (opts.sort === 'random') {
        return 0.5 - Math.random() // this is vaguely criminal but we can get away with it
      }
      return b.post.indexedAt.localeCompare(a.post.indexedAt)
    })
    node.replies.forEach(reply => sortThread(reply, opts))
  }
  return node
}

// internal methods
// =

function responseToThreadNodes(
  node: ThreadViewNode,
  depth = 0,
  direction: 'up' | 'down' | 'start' = 'start',
): ThreadNode {
  if (
    AppBskyFeedDefs.isThreadViewPost(node) &&
    AppBskyFeedPost.isRecord(node.post.record) &&
    AppBskyFeedPost.validateRecord(node.post.record).success
  ) {
    return {
      type: 'post',
      _reactKey: node.post.uri,
      uri: node.post.uri,
      post: node.post,
      record: node.post.record,
      parent:
        node.parent && direction !== 'down'
          ? responseToThreadNodes(node.parent, depth - 1, 'up')
          : undefined,
      replies:
        node.replies?.length && direction !== 'up'
          ? node.replies
              .map(reply => responseToThreadNodes(reply, depth + 1, 'down'))
              // do not show blocked posts in replies
              .filter(node => node.type !== 'blocked')
          : undefined,
      viewer: node.viewer,
      ctx: {
        depth,
        isHighlightedPost: depth === 0,
        hasMore:
          direction === 'down' && !node.replies?.length && !!node.replyCount,
        showChildReplyLine:
          direction === 'up' ||
          (direction === 'down' && !!node.replies?.length),
        showParentReplyLine:
          (direction === 'up' && !!node.parent) ||
          (direction === 'down' && depth !== 1),
      },
    }
  } else if (AppBskyFeedDefs.isBlockedPost(node)) {
    return {type: 'blocked', _reactKey: node.uri, uri: node.uri, ctx: {depth}}
  } else if (AppBskyFeedDefs.isNotFoundPost(node)) {
    return {type: 'not-found', _reactKey: node.uri, uri: node.uri, ctx: {depth}}
  } else {
    return {type: 'unknown', uri: ''}
  }
}

function findPostInQueryData(
  queryClient: QueryClient,
  uri: string,
): ThreadNode | undefined {
  const queryDatas = queryClient.getQueriesData<ThreadNode>({
    queryKey: ['post-thread'],
  })
  for (const [_queryKey, queryData] of queryDatas) {
    if (!queryData) {
      continue
    }
    for (const item of traverseThread(queryData)) {
      if (item.uri === uri) {
        return item
      }
    }
  }
  return undefined
}

function* traverseThread(node: ThreadNode): Generator<ThreadNode, void> {
  if (node.type === 'post') {
    if (node.parent) {
      yield* traverseThread(node.parent)
    }
    yield node
    if (node.replies?.length) {
      for (const reply of node.replies) {
        yield* traverseThread(reply)
      }
    }
  }
}

function threadNodeToPlaceholderThread(
  node: ThreadNode,
): ThreadNode | undefined {
  if (node.type !== 'post') {
    return undefined
  }
  return {
    type: node.type,
    _reactKey: node._reactKey,
    uri: node.uri,
    post: node.post,
    record: node.record,
    parent: undefined,
    replies: undefined,
    viewer: node.viewer,
    ctx: {
      depth: 0,
      isHighlightedPost: true,
      hasMore: false,
      showChildReplyLine: false,
      showParentReplyLine: false,
      isParentLoading: !!node.record.reply,
      isChildLoading: !!node.post.replyCount,
    },
  }
}

function feedViewPostToPlaceholderThread(
  item: AppBskyFeedDefs.FeedViewPost,
): ThreadNode {
  return {
    type: 'post',
    _reactKey: item.post.uri,
    uri: item.post.uri,
    post: item.post,
    record: item.post.record as AppBskyFeedPost.Record, // validated in post-feed
    parent: undefined,
    replies: undefined,
    viewer: item.post.viewer,
    ctx: {
      depth: 0,
      isHighlightedPost: true,
      hasMore: false,
      showChildReplyLine: false,
      showParentReplyLine: false,
      isParentLoading: !!(item.post.record as AppBskyFeedPost.Record).reply,
      isChildLoading: !!item.post.replyCount,
    },
  }
}

function postViewToPlaceholderThread(
  post: AppBskyFeedDefs.PostView,
): ThreadNode {
  return {
    type: 'post',
    _reactKey: post.uri,
    uri: post.uri,
    post: post,
    record: post.record as AppBskyFeedPost.Record, // validated in notifs
    parent: undefined,
    replies: undefined,
    viewer: post.viewer,
    ctx: {
      depth: 0,
      isHighlightedPost: true,
      hasMore: false,
      showChildReplyLine: false,
      showParentReplyLine: false,
      isParentLoading: !!(post.record as AppBskyFeedPost.Record).reply,
      isChildLoading: !!post.replyCount,
    },
  }
}
