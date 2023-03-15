;(function () {
  const { Vue, appUse, appMount, appUnMount, VueUse, electron, logger } =
    window.usePlugin()
  const { useScriptTag, useLocalStorage, get } = VueUse
  const { ipcOn, ipcOff, ipcSend, ipcInvoke } = electron
  const { createApp, defineComponent, ref, reactive } = Vue

  const dashPlayerData = reactive({
    bvideoLoaded: false,
    dashjsLoaded: false,
    title: '',
    data: {},
  })

  const serverStateMap = {
    '-1': { state: 'state-loading', name: '测试中' },
    0: { state: 'state-error', name: '失败' },
    1: { state: 'state-pass', name: '可用' },
  }

  useScriptTag(
    'https://s1.hdslb.com/bfs/static/player/main/video.9dd23994.js?v=20210111',
    (el) => {
      console.log(el)
      dashPlayerData.bvideoLoaded = true
    }
  )

  const config = get(
    useLocalStorage('PLUGIN_BILIBILI-HELPER', { proxy: 'https://出差.xyz' })
  )

  const checkUrlMap = {
    'bangumi-media': /\/bangumi\/media\/md(\d+)/,
    'bangumi-ep': /\/bangumi\/play\/ep(\d+)/,
    'bangumi-ss': /\/bangumi\/play\/ss(\d+)/,
    video: /\/video\/(BV[\d\w]+)/,
    'user-video-list': /space\.bilibili\.com\/(\d+)/,
  }

  const biliBaseAPI = 'https://api.bilibili.com'
  async function fetchBiliApi(api, proxy = false) {
    const resp = await fetch((proxy ? config.proxy : biliBaseAPI) + api)
    try {
      const json = await resp.json()
      if (json.code) throw new Error(json.message)
      return json.result || json.data
    } catch (error) {
      throw new Error('数据获取失败！')
    }
  }

  async function fetchTestProxy(proxyUrl, timeout = 10 * 1000) {
    const controller = new AbortController()
    const signal = controller.signal
    setTimeout(() => {
      controller.abort()
    }, timeout)

    const resp = await fetch(
      proxyUrl +
        '/pgc/player/web/playurl?aid=428150903&bvid=BV1YG411W7zZ&cid=765477233&qn=80&fnver=0&fnval=4048&fourk=1&type=&otype=json&module=bangumi&balh_ajax=1',
      { signal }
    )
    try {
      const json = await resp.json()
      if (json.code) throw new Error(json.message)
      return json.result || json.data
    } catch (error) {
      throw new Error('数据获取失败！')
    }
  }

  async function fetchBangumiMediaHTML(url) {
    const resp = await fetch(url)
    const text = await resp.text()
    const doc = new DOMParser().parseFromString(text, 'text/html')
    const scripts = Array.from(doc.querySelectorAll('script'))
    const INITIAL_STATE = scripts.find((item) =>
      item.innerText.includes('__INITIAL_STATE__')
    )
    let info = {}
    if (INITIAL_STATE) {
      const matched = INITIAL_STATE.innerHTML.match(
        /__INITIAL_STATE__=([\s\S]+});/
      )
      try {
        if (matched) {
          info = JSON.parse(matched[1]).mediaInfo
          logger.response('FetchBiliApi', '__INITIAL_STATE__', info)
        }
      } catch (error) {
        console.error(error)
      }
    }
    return { info }
  }

  async function fetchBangumiMediaInfo(media_id) {
    const resp = await fetchBiliApi(`/pgc/review/user?media_id=${media_id}`)
    logger.response('FetchBiliApi', 'media', resp.media)
    return resp.media
  }

  async function fetchBangumiSeasonInfo(season_id) {
    const resp = await fetchBiliApi(
      `/pgc/web/season/section?season_id=${season_id}`
    )
    logger.response('FetchBiliApi', 'season', resp)
    return resp
  }

  async function fetchPlayerInfo(bvid = '', cid = '', aid = '') {
    const resp = await fetchBiliApi(
      `/x/player/v2?bvid=${bvid}&cid=${cid}&aid=${aid}`
    )
    logger.response('FetchBiliApi', 'player', resp)
    return resp
  }

  async function fetchPlayList({ aid = '', bvid = '' }) {
    const api = `/x/player/pagelist?bvid=${bvid}&aid=${aid}`
    const resp = await fetchBiliApi(api)
    logger.response('FetchBiliApi', 'fetchPlayList', resp)
    return resp
  }

  async function fetchPlayUrl(
    proxy = false,
    { cid = '', qn = 80, aid = '', bvid = '' }
  ) {
    const api = `/pgc/player/web/playurl?aid=${aid}&bvid=${bvid}&cid=${cid}&qn=${qn}&fnver=0&fnval=4048&fourk=1&type=&otype=json&module=bangumi&balh_ajax=1`
    const resp = await fetchBiliApi(api, proxy)
    logger.response(
      'FetchBiliApi',
      `playUrl${proxy ? ' [proxy]' : ''}`,
      api,
      resp
    )
    return resp
  }

  async function fetchVideoInfo({ aid = '', bvid = '' }) {
    const api = `/x/web-interface/view?bvid=${bvid}&aid=${aid}`
    const resp = await fetchBiliApi(api)
    logger.response('FetchBiliApi', 'videoInfo', api, resp)
    return resp
  }

  async function fetchUserVideos({
    uid = '',
    keyword = '',
    order = 'pubdate',
    pn = 1,
    ps = 30,
  }) {
    const api = `/x/space/arc/search?mid=${uid}&ps=${ps}&tid=0&pn=${pn}&keyword=${keyword}&order=${order}&jsonp=jsonp`
    const resp = await fetchBiliApi(api)
    logger.response('FetchBiliApi', 'UserVideos', api, resp)
    return resp
  }

  async function downloadSubtitle(subtitle, title) {
    if (subtitle.blobUrl) {
      console.log('使用缓存下载字幕', subtitle)
      downloadFile(subtitle.blobUrl, subtitle.srtFileName)
      return
    }
    console.log(subtitle)
    const { subtitle_url, lan_doc } = subtitle
    const resp = await fetch(subtitle_url)
    const json = await resp.json()
    const srtData = json.body
      .map(
        (item, i) => `${i + 1}\n${item.from} --> ${item.to}\n${item.content}\n`
      )
      .join('\n')
    const blob = new Blob([srtData])
    const blobUrl = URL.createObjectURL(blob)
    const srtFileName =
      `${title}.${subtitle.lan_doc}`.replace(
        /[\\s\\\\\/:\\*\\?\\\"<>\\|]/g,
        '_'
      ) + '.srt'
    downloadFile(blobUrl, srtFileName)
    subtitle.blobUrl = blobUrl
    subtitle.srtFileName = srtFileName
  }

  function downloadFile(url, filename) {
    const a = document.createElement('a')
    a.href = url
    if (filename) a.setAttribute('download', filename)
    a.click()
  }

  const DashPlayer = defineComponent({
    name: 'DashPlayer',

    template: `<a-modal v-model:visible="mVisible"
    class="dash-player"
    :title="dashPlayerData.title || '播放器'"
    :modal-style="{padding: 0}"
    :width="900"
    :mask-closable="false"
    :footer="false">
      <acg-ratio-div :ratio="[16,9]">
        <acg-api-result :loading="areaLoading" 
          :error="areaError" 
          message="正在渡海中……"
          error-message="区域代理失败！"
          @retry="loadPlayer"></acg-api-result>
        <div v-show="!areaLoading && !areaError" id="bofqi"></div>
      </acg-ratio-div>
    </a-modal>`,

    props: {
      modelValue: Boolean,
    },

    emits: ['update:modelValue'],

    setup() {
      const videoEl = ref()
      return { videoEl }
    },

    data() {
      return {
        areaError: false,
        areaLoading: false,
        bPlayer: null,
        XMLOriginOpen: window.XMLHttpRequest.prototype.open,
      }
    },

    computed: {
      mVisible: {
        get() {
          return this.modelValue
        },
        set(val) {
          this.$emit('update:modelValue', val)
        },
      },

      dashPlayerData() {
        return dashPlayerData
      },
    },

    watch: {
      mVisible(visible) {
        if (visible) {
          this.loadPlayer()
        } else {
          this.stopPlayer()
          this.unhookXHR()
        }
      },
    },

    methods: {
      hookXHR() {
        XMLOriginOpen = this.XMLOriginOpen
        window.XMLHttpRequest.prototype.open = function (methods, url, async) {
          if (url.includes('playurl?') && config.proxy) {
            const search = new URL(url).search
            arguments[1] = `${config.proxy}/pgc/player/web/playurl${search}`
          }
          return XMLOriginOpen.apply(this, arguments)
        }
      },

      unhookXHR() {
        window.XMLHttpRequest.prototype.open = this.XMLOriginOpen
      },

      async loadPlayInfo() {
        const { aid, cid, bvid, isAreaLimit, playInfo } =
          this.dashPlayerData.data
        const mPlayinfo =
          playInfo || (await fetchPlayUrl(isAreaLimit, { cid, aid, bvid }))
        window.__playinfo__ = mPlayinfo
      },

      async loadPlayer() {
        this.stopPlayer()
        const { aid, cid, isAreaLimit, playInfo } = this.dashPlayerData.data
        if (isAreaLimit) {
          this.hookXHR()
          this.areaLoading = true
          this.areaError = false
          try {
            await this.loadPlayInfo()
          } catch (error) {
            console.error(error)
            this.areaError = true
          }
          this.areaLoading = false
          if (this.areaError) return
        }

        this.bPlayer = new BPlayer({
          aid,
          cid,
          autoplay: true,
          theme: isAreaLimit ? 'red' : '',
        })
        console.log(this.bPlayer)
      },

      async stopPlayer() {
        try {
          this.bPlayer && this.bPlayer.player.stop()
        } catch (error) {
          console.error(error)
        }
        try {
          this.bPlayer && this.bPlayer.player.destroy()
        } catch (error) {
          console.error(error)
        }
      },
    },
  })

  const HelperSetting = defineComponent({
    name: 'HelperSetting',

    template: `<a-modal v-model:visible="mVisible"
      simple
      closable
      title="哔哩哔哩助手设置"
      hideCancel
      okText="关闭"
      modal-class="bilibili-helper-setting"
      :width="600">
      <a-form :model="{}">
        <a-form-item label="代理服务器" help="填写用于解除B站区域限制的服务器地址">
          <a-input v-model="config.proxy"></a-input>
        </a-form-item>
        <div class="server-list">
          <a-table :columns="columns" :data="serverList" 
            :scroll="{y:200}" :pagination="false">
            <template #optional="{ record }">
              <a-button @click="switchServer(record)">选择</a-button>
            </template>
          </a-table>
        </div>
      </a-form>
    </a-modal>`,

    props: {
      modelValue: Boolean,
    },

    emits: ['update:modelValue'],

    data() {
      return {
        serverList: [],
        columns: [
          { title: '服务器', dataIndex: 'url' },
          {
            title: '状态',
            dataIndex: 'state',
            render: function ({ record }) {
              const state = serverStateMap[record.state]
              return Vue.h('span', { className: state.state }, state.name)
            },
          },
          { title: '信息', dataIndex: 'message' },
          { title: '选项', slotName: 'optional', width: 120 },
        ],
      }
    },

    computed: {
      mVisible: {
        get() {
          return this.modelValue
        },
        set(val) {
          this.$emit('update:modelValue', val)
        },
      },

      config() {
        return config
      },
    },

    created() {
      this.fetchServerList()
    },

    methods: {
      async fetchServerList() {
        const resp = await fetch(
          'https://github.com/yujincheng08/BiliRoaming/wiki/%E5%85%AC%E5%85%B1%E8%A7%A3%E6%9E%90%E6%9C%8D%E5%8A%A1%E5%99%A8'
        )
        const text = await resp.text()
        const doc = new DOMParser().parseFromString(text, 'text/html')

        this.serverList = Array.from(
          doc.querySelectorAll('table tbody tr td:nth-child(3n) > li')
        )
          .map((item) => ({
            url: 'https://' + item.innerHTML,
            state: -1,
            message: '',
          }))
          .filter((item) => !item.url.includes('<del'))
        this.testProxyList()
      },

      async fetchProxyItem(item) {
        try {
          item.state = -1
          item.message = ''
          const data = await fetchTestProxy(item.url)
          item.state = 1
        } catch (error) {
          item.state = 0
          item.message = error.message
          if (error.message.includes('aborted')) {
            item.message = '超时'
          }
        }
      },

      testProxyList() {
        this.serverList.forEach((item) => {
          this.fetchProxyItem(item)
        })
      },

      switchServer(record) {
        config.proxy = record.url
      },
    },
  })

  const BUserVideos = defineComponent({
    name: 'BiliUserVideos',
    template: `<div class="bili-user-videos">
      <div class="user-info layout-lr py-10 pr-8">
        <div></div>
        <div>
          <a-input-search v-model="keyword" size="small" @search="search" @press-enter="search"></a-input-search>
        </div>
      </div>
      <div class="video-list">
        <acg-api-result :loading="loading" 
          :error="isError"
          @retry="fetchVideos" />
          <a-space wrap class="video-list">
          <a-card v-for="item of vlist" :key="item.aid" class="video-card cursor-pointer" size="small" @click="$emit('play-video',item)">
            <template #cover>
              <acg-ratio-div :ratio="[16, 10]">
                <img loading="lazy" :src="item.pic">
              </acg-ratio-div>
            </template>
            <div class="video-title multi-text-truncate" data-line="2" style="word-break: break-all;">{{item.title}}</div>
            <div class="video-info"></div>
          </a-card>
        </a-space>

        <a-pagination
          v-model:current="page.pn"
          :total="page.count"
          :page-size="page.ps"
          style="justify-content: flex-end;"
          @change="handlePageChange" />
      </div>
    </div>`,
    props: { uid: String },
    emits: ['play-video'],
    data() {
      return {
        loading: false,
        isError: false,
        keyword: '',
        tlist: [],
        vlist: [],
        page: { pn: 1, ps: 30, count: 0 },
      }
    },
    watch: {
      uid: {
        immediate: true,
        handler() {
          this.keyword = ''
          this.search()
        },
      },
    },
    methods: {
      async fetchVideos() {
        this.loading = true
        this.isError = false
        try {
          const { list, page } = await fetchUserVideos({
            uid: this.uid,
            pn: this.page.pn,
            keyword: this.keyword,
          })
          list.vlist.forEach((item) => {
            item.isAreaLimit = /僅限.+地區/.test(item.title)
          })
          this.page = page
          this.vlist = list.vlist
          this.tlist = list.tlist
        } catch (error) {
          console.error(error)
          this.isError = true
        }
        this.loading = false
      },

      async handlePageChange() {
        this.vlist = []
        this.fetchVideos()
      },

      async search() {
        this.vlist = []
        this.page.pn = 1
        this.page.count = 0
        this.fetchVideos()
      },
    },
  })

  const BVideo = defineComponent({
    name: 'BiliVideo',
    template: `<div class="bili-video">
  <div class="bili-base-info d-flex">
    <a-card :bordered="false" class="flex-shrink-0" style="width: 320px" size="small">
      <template #cover>
        <acg-ratio-div :ratio="[16,9]" class="cursor-pointer" @click="$emit('play-video', video)">
          <img v-if="video.pic" :src="video.pic + '@640w_360h.webp'">
          <div class="video-cover-masker layout-center">
            <icon-play-circle size="48" />
          </div>
        </acg-ratio-div>
      </template>
      <a-space v-if="video.stat" class="d-flex justify-content-center mt-4">
        <span title="点赞数">
          <icon-thumb-up-fill /> {{ video.stat.like }}
        </span>
        <span title="硬币数">
          <span class="icon-bcoin"></span> {{ video.stat.coin }}</span>
        <span title="收藏数">
          <icon-star-fill /> {{ video.stat.favorite }}
        </span>
        <span title="分享数">
          <icon-share-internal /> {{ video.stat.share }}
        </span>
      </a-space>
    </a-card>
    <a-space class="pl-25" direction="vertical">
      <div class="title">
        <h5 class="lh-24">{{ video.title }}</h5>
      </div>

      <a-space v-if="video.stat">
        <a-tag class="mr-6">{{ video.tname }}</a-tag>
        <span title="播放数">
          <icon-eye /> {{ video.stat.view }}
        </span>
        <span title="弹幕数">
          <icon-nav /> {{ video.stat.danmaku }}
        </span>
        <span title="发布时间">
          <icon-clock-circle /> {{$dayjs((video.pubdate||0) * 1000).format('YYYY-MM-DD HH:mm:ss')}}
        </span>
      </a-space>

      <a-space size="mini">
        <a-tag color="arcoblue" size="small">aid: {{ video.aid }}</a-tag>
        <a-tag color="arcoblue" size="small">bvid: {{ video.bvid }}</a-tag>
        <a-tag color="arcoblue" size="small">cid: {{ video.cid }}</a-tag>
      </a-space>

      <div class="desc multi-text-truncate" style="height: 3.5em;" data-line="3" :title="video.desc">{{ video.desc || '' }}</div>

      <a-space size="mini" class="owner-list mt-6">
        <div v-if="video.owner" class="owner d-inline-flex flex-column">
          <a-avatar class="m-auto">
            <img alt="avatar" :src="video.owner.face" />
          </a-avatar>
          <div class="mt-4">{{ video.owner.name }}</div>
        </div>
      </a-space>
    </a-space>
  </div>
</div>
<template v-if="pages && pages.length > 1" >
  <div class="fs-18 lh-24 pl-24 my-8">视频选集</div>
  <a-space class="bili-video-pages" wrap>
    <a-card v-for="page of pages" 
      :key="page.cid" 
      :bordered="false" 
      size="small" 
      class="cursor-pointer"
      @click="$emit('play-video',page)">
        <div class=" text-truncate" :title="\`$\{ page.title } $\{page.long_title}\`">{{ page.title }} {{page.long_title}}</div>
      </a-card>
  </a-space>
</template>
`,
    props: { video: { type: Object, default: () => ({}) } },

    emits: ['play-video'],

    computed: {
      pages() {
        return (this.video.pages || []).map((page) => {
          return {
            ...page,
            title: 'P' + page.page,
            long_title: page.part,
            aid: this.video.aid,
            bvid: this.video.bvid,
          }
        })
      },
    },

    methods: {
      $dayjs: window.$dayjs,
    },
  })

  const BangumiMedia = defineComponent({
    name: 'BangumiMedia',

    template: `<div class="bangumi-media d-flex">
      <div class="flex-shrink-0" style="width: 140px">
        <acg-ratio-div :ratio="[3,4]">
          <img v-if="media.cover" :src="media.cover + '@450w_600h.webp'">
        </acg-ratio-div>
      </div>
      <a-space class="pl-25" direction="vertical">
        <div class="title d-flex">
          <a-tag class="mr-6">{{ media.type_name }}</a-tag>
          <h5 class="lh-24">{{ media.title }}</h5>
        </div>
        <a-space v-if="media.info && media.info.styles" size="mini">
          <a-tag v-for="tag of media.info.styles" 
            :key="tag.id" color="arcoblue" size="small">{{ tag.name }}</a-tag>
        </a-space>
        <a-space size="large" class="mt-8">
          <span v-if="media.info && media.info.publish">{{ media.info.publish.release_date_show }}</span>
          <span v-if="media.info && media.info.publish">{{ media.info.publish.time_length_show }}</span>
          <span>{{ media.new_ep ? media.new_ep.index_show : '' }}</span>
        </a-space>
        <div v-if="media.info && media.info.evaluate">简介：{{ media.info.evaluate }}</div>
      </a-space>
      <div v-if="media.rating && media.rating.score" class="d-flex rate">
        <span class="fs-36 mr-4">
          {{ media.rating ? media.rating.score : '无'}}
        </span>
        <span>
          <a-rate readonly allow-half
            :model-value="media.rating ? media.rating.score / 2 : 0" />
          <div>{{ media.rating ? media.rating.count + '人评价' : '' }}</div>
        </span>
      </div>
    </div>
    <div class="bangumi-media-list">
      <template v-if="media.main_section && media.main_section.id">
        <a-list :bordered="false" :split="false" size="small">
          <template #header>{{ media.main_section.title }}</template>
          <a-list-item v-for="episode of media.main_section.episodes"
            :key="episode.id" >
            <a-card class="episode-card">
              <template #cover>
                <acg-ratio-div :ratio="[16, 10]" class="cursor-pointer" @click="$emit('play-video',episode)">
                  <img :src="episode.cover + '@192w_120h_1c.webp'" loading="lazy" />
                  <div class="video-cover-masker layout-center">
                    <icon-play-circle size="48" />
                  </div>
                </acg-ratio-div>
              </template>
              <a-card-meta>
                <template #title>
                  <a-tag v-if="episode.badge_info.text"
                    :color="episode.badge_info.bg_color"
                    class="mr-4" size="small"
                    style="vertical-align: text-top;">{{ episode.badge_info.text }}</a-tag>
                  {{getTitle(episode)}}
                </template>

                <template #description>
                  <a-space direction="vertical" fill>
                    <div v-if="media.isAreaLimit && !episode.playInfo">
                      <a-button type="outline" :loading="episode.dataLoading"
                        @click="$emit('fetchPlayUrl',episode)">获取视频地址</a-button>
                    </div>
                    <div v-else-if="episode.playInfo && episode.playInfo.type === 'DASH'">
                      <a-space>
                        <span>下载参数:</span>
                        <span>视频</span>
                        <a-select v-model="episode.selectedVideo" style="width: 200px;">
                          <a-option v-for="video of getEpisodeVideo(episode)" 
                          :key="video.key" 
                          :value="video.key" 
                          :label="video.label"></a-option>
                        </a-select>

                        <span>音频</span>
                        <a-select v-model="episode.selectedAudio" style="width: 180px;">
                          <a-option v-for="audio of getEpisodeAudio(episode)" 
                          :key="audio.key" 
                          :value="audio.key" 
                          :label="audio.label"></a-option>
                        </a-select>
                      </a-space>
                    </div>
                    <div v-if="episode.subtitles && episode.subtitles.length">
                      <a-space size="mini">
                        <span>字幕：</span>
                        <a-button v-for="subtitle of episode.subtitles" 
                          :key="subtitle.id" 
                          size="mini"
                          type="text"
                          @click="downloadSubtitle(subtitle,media.title + ' ' + getTitle(episode))">{{ subtitle.lan_doc }}</a-button>
                      </a-space>
                    </div>
                  </a-space>
                </template>
              </a-card-meta>
            </a-card>
          </a-list-item>
        </a-list>
      </template>
    </div>`,

    props: { media: { type: Object, default: () => ({}) } },

    emits: ['fetchPlayUrl', 'play-video'],

    data() {
      return {
        audioQualityMap: {
          30280: '高质量',
          30232: '中质量',
          30216: '低质量',
        },
      }
    },

    methods: {
      downloadSubtitle,
      getTitle(episode) {
        return `第${episode.title}话 ${episode.long_title}`
      },

      getEpisodeVideo(episode) {
        if (!episode.playInfo || episode.playInfo.type !== 'DASH') return []
        const { support_formats, dash } = episode.playInfo
        const result = dash.video.map((item) => {
          const format = support_formats.find(
            (format) => format.quality === item.id
          ) || { new_description: '' }
          return {
            ...item,
            key: item.id + item.codecs,
            label: `${format.new_description} ${item.codecs}`,
          }
        })
        if (result.length && !episode.selectedVideo) {
          episode.selectedVideo = result[0].key
        }
        return result
      },

      getEpisodeAudio(episode) {
        if (!episode.playInfo || episode.playInfo.type !== 'DASH') return []
        const { dash } = episode.playInfo
        const result = dash.audio.map((item) => {
          const format = {
            new_description: this.audioQualityMap[item.id] || '',
          }
          return {
            ...item,
            key: item.id + item.codecs,
            label: `${format.new_description} ${item.codecs}`,
          }
        })
        if (result.length && !episode.selectedAudio) {
          episode.selectedAudio = result[0].key
        }
        return result
      },
    },
  })

  const app = createApp({
    name: 'BilibiliHelper',

    template: `<a-layout class="bilibili-helper">
      <a-layout-header style="height: 64px;">
        <div class="layout-center py-16">
          <a-input-search v-model="url" 
          search-button
          placeholder="请输入B站的视频地址" 
          button-text="获取"
          :style="{width:'500px'}" 
          @press-enter="parseLink"
          @search="parseLink" />
        </div>
        <div class="quick-links">
          <a-link @click="quickLink('https://space.bilibili.com/11783021/video')">番剧出差</a-link>
        </div>
        <a-button class="btn-helper-setting"
          type="primary" shape="circle"
          @click="isDisplaySetting = true">
          <icon-settings />
        </a-button>
      </a-layout-header>
      <a-layout-content>
        <BangumiMedia v-if="type === 'bangumi-media'" :media="media" @fetchPlayUrl="fetchVideoUrl"
        @play-video="playVideo"/>
        <BVideo v-else-if="type === 'video'" :video="video"  @play-video="playVideo"></BVideo>
        <BUserVideos v-else-if="type==='user-video-list'" :uid="uid" @play-video="playVideo"></BUserVideos>
      </a-layout-content>
      <HelperSetting v-model="isDisplaySetting" />
      <DashPlayer v-model="isDisplayDashPlayer" />
    </a-layout>`,

    components: {
      BangumiMedia,
      BVideo,
      HelperSetting,
      DashPlayer,
      BUserVideos,
    },

    data() {
      return {
        isDisplaySetting: false,
        isDisplayDashPlayer: false,
        url: '',
        type: '',
        media: {},
        video: {},
        uid: '',
      }
    },

    created() {},

    mounted() {},

    methods: {
      quickLink(url) {
        this.url = url
        this.parseLink()
      },

      getUrlType() {
        if (!this.url) return ''
        try {
          const url = new URL(this.url)
          if (!url.host.includes('.bilibili.com')) return ''
          const type = Object.keys(checkUrlMap).find((type) =>
            checkUrlMap[type].test(url.href)
          )
          logger.message('getUrlType', type, url)
          return type || ''
        } catch (error) {
          console.error(error)
          return ''
        }
      },

      parseLink() {
        this.type = this.getUrlType()
        if (!this.type) {
          return this.$notification.warning({
            title: '视频地址无法解析!',
            content: '请检查地址输入是否准确！',
            closable: true,
            position: 'bottomRight',
          })
        }

        if (this.type === 'bangumi-media') {
          this.parseBangumiMedia(this.url)
        } else if (this.type === 'video') {
          this.parseVideo(this.url)
        } else if (this.type === 'user-video-list') {
          this.parseUserId(this.url)
        }
      },

      async parseBangumiMedia(url) {
        const matched = url.match(checkUrlMap['bangumi-media'])
        if (matched && matched.length > 1) {
          const media_id = matched[1]
          const media = await fetchBangumiMediaInfo(media_id)
          this.media = Object.assign(
            { main_section: {}, section: [], info: {} },
            media
          )
          this.media.isAreaLimit = /僅限.+地區/.test(this.media.title)
          fetchBangumiMediaHTML(url).then(({ info }) => {
            this.media.info = info
          })

          if (media.season_id) {
            const season = await fetchBangumiSeasonInfo(media.season_id)
            Object.assign(this.media, season)
            this.media.main_section.episodes.forEach(async (ep) => {
              ep.isAreaLimit = this.media.isAreaLimit
              ep.selectedVideo = ''
              ep.selectedAudio = ''
              ep.dataLoading = false
            })
            if (this.media.isAreaLimit) {
              logger.message('港澳台自动获取字幕中……')
              this.media.main_section.episodes.forEach((ep) => {
                fetchPlayerInfo(ep.bvid, ep.cid, ep.aid).then((info) => {
                  if (info.subtitle) {
                    ep.subtitles = info.subtitle.subtitles || []
                  }
                })
              })
            } else {
              this.media.main_section.episodes.forEach(async (ep) => {
                this.fetchVideoUrl(ep)
              })
            }
          }
          logger.message('media result', 'media', this.media)
        }
      },

      async parseVideo(url) {
        const matched = url.match(checkUrlMap['video'])

        if (matched && matched.length > 1) {
          const bvid = matched[1]
          const info = await fetchVideoInfo({ bvid })
          console.log(info)
          this.video = info
        }
      },

      parseUserId(url) {
        const matched = url.match(checkUrlMap['user-video-list'])
        if (matched && matched.length > 1) {
          this.uid = matched[1]
        }
      },

      async playVideo(ep) {
        logger.message('playVideo', 'data', ep)
        if (['video', 'bangumi-media'].includes(this.type)) {
          if (ep.badge === '会员') {
            this.$message.warning('无法播放会员视频！')
            return
          }
        } else if (this.type === 'user-video-list') {
          if (ep.isAreaLimit && !ep.cid) {
            const pagelist = await fetchPlayList(ep)
            if (pagelist.length) {
              const { cid } = pagelist[0]
              ep.cid = cid
            }
          }
        }
        dashPlayerData.title =
          ep.title + (ep.long_title ? ' ' + ep.long_title : '')
        dashPlayerData.data = { ...ep }
        this.isDisplayDashPlayer = true
      },

      async fetchVideoUrl(ep) {
        ep.dataLoading = true
        try {
          const proxy = ep.isAreaLimit
          const playInfo = await fetchPlayUrl(proxy, {
            cid: ep.cid,
            aid: ep.aid,
          })
          ep.playInfo = playInfo
        } catch (error) {
          ep.dataLoading = false
        }
      },
    },
  })
  appUse(app)
  const vm = appMount(app)
})()
