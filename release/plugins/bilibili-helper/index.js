;(function () {
  const { Vue, appUse, appMount, appUnMount, VueUse, electron, logger } =
    window.usePlugin()
  const { useLocalStorage, get } = VueUse
  const { ipcOn, ipcOff, ipcSend, ipcInvoke } = electron
  const { createApp, defineComponent } = Vue

  const config = get(
    useLocalStorage('PLUGIN_BILIBILI-HELPER', { proxy: 'https://出差.xyz' })
  )

  const checkUrlMap = {
    'bangumi-media': /\/bangumi\/media\/md(\d+)/,
    'bangumi-ep': /\/bangumi\/play\/ep(\d+)/,
    'bangumi-ss': /\/bangumi\/play\/ss(\d+)/,
    video: /\/video\/BV([\d\w]+)/,
  }

  const biliBaseAPI = 'https://api.bilibili.com'
  async function fetchBiliApi(api, proxy = false) {
    const resp = await fetch((proxy ? config.proxy : biliBaseAPI) + api)
    const json = await resp.json()
    if (json.code) throw new Error(json.message)
    return json.result || json.data
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

  async function fetchPlayUrl(proxy = false, { cid, qn = 80, aid }) {
    const api = `/pgc/player/web/playurl?aid=${aid}&cid=${cid}&qn=${qn}&fnver=0&fnval=4048&fourk=1&type=&otype=json&module=bangumi&balh_ajax=1`
    const resp = await fetchBiliApi(api, proxy)
    logger.response(
      'FetchBiliApi',
      `playUrl${proxy ? ' [proxy]' : ''}`,
      api,
      resp
    )
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

  const HelperSetting = defineComponent({
    name: 'HelperSetting',

    template: `<a-modal v-model:visible="mVisible"
      simple
      closable
      title="哔哩哔哩助手设置"
      hideCancel
      okText="关闭"
      :width="600">
      <a-form :model="{}">
        <a-form-item label="代理服务器" help="填写用于解除B站区域限制的服务器地址">
          <a-input v-model="config.proxy"></a-input>
        </a-form-item>
      </a-form>
    </a-modal>`,

    props: {
      modelValue: Boolean,
    },

    emits: ['update:modelValue'],

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
  })

  const BangumiMedia = defineComponent({
    name: 'BangumiMedia',

    template: `<div class="bangumi-media d-flex">
      <div class="flex-shrink-0" style="width: 140px">
        <acg-ratio-div :ratio="[3,4]">
          <img :src="media.cover + '@450w_600h.webp'">
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
                <acg-ratio-div :ratio="[16, 10]">
                  <img :src="episode.cover + '@192w_120h_1c.webp'" loading="lazy" />
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
                  <div v-if="media.isAreaLimit">
                    <a-button size="mini" type="outline" @click="$emit('fetchPlayUrl',episode,true)">获取视频地址</a-button>
                  </div>
                  <div v-if="episode.subtitles && episode.subtitles.length"  class="mt-8">
                    <a-space size="mini">
                      <span>字幕：</span>
                      <a-button v-for="subtitle of episode.subtitles" 
                        :key="subtitle.id" 
                        size="mini"
                        type="text"
                        @click="downloadSubtitle(subtitle,media.title + ' ' + getTitle(episode))">{{ subtitle.lan_doc }}</a-button>
                    </a-space>
                  </div>
                </template>
              </a-card-meta>
            </a-card>
          </a-list-item>
        </a-list>
      </template>
    </div>`,

    props: { media: { type: Object, default: () => ({}) } },

    emits: ['fetchPlayUrl'],

    data() {
      return {}
    },

    methods: {
      downloadSubtitle,
      getTitle(episode) {
        return `第${episode.title}话 ${episode.long_title}`
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
        <a-button class="btn-helper-setting"
          type="primary" shape="circle"
          @click="isDisplaySetting = true">
          <icon-settings />
        </a-button>
      </a-layout-header>
      <a-layout-content>
        <BangumiMedia v-if="type==='bangumi-media'" :media="media" @fetchPlayUrl="fetchVideoUrl"/>
      </a-layout-content>
      <HelperSetting v-model="isDisplaySetting" />
    </a-layout>`,

    components: { BangumiMedia, HelperSetting },

    data() {
      return {
        isDisplaySetting: false,
        url: '',
        type: '',
        media: {},
      }
    },

    created() {},

    mounted() {},

    methods: {
      getUrlType() {
        if (!this.url) return ''
        try {
          const url = new URL(this.url)
          if (url.host !== 'www.bilibili.com') return ''
          const type = Object.keys(checkUrlMap).find((type) =>
            checkUrlMap[type].test(url.pathname)
          )
          return type || ''
        } catch (error) {
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
            if (this.media.isAreaLimit) {
              logger.message('港澳台自动获取字幕中……')
              this.media.main_section.episodes.forEach((ep) => {
                fetchPlayerInfo(ep.bvid, ep.cid, ep.aid).then((info) => {
                  if (info.subtitle) {
                    ep.subtitles = info.subtitle.subtitles || []
                  }
                })
                // fetchPlayUrl(true, { cid: ep.cid, aid: ep.aid }).then(
                //   (playInfo) => {
                //     ep.playInfo = playInfo
                //   }
                // )
              })
            } else {
              this.media.main_section.episodes.forEach(async (ep) => {
                fetchVideoUrl(ep)
              })
            }
          }
          console.log(this.media)
        }
      },

      async fetchVideoUrl(ep, proxy = false) {
        const playInfo = await fetchPlayUrl(proxy, {
          cid: ep.cid,
          aid: ep.aid,
        })
        ep.playInfo = playInfo
      },
    },
  })
  appUse(app)
  const vm = appMount(app)
})()
