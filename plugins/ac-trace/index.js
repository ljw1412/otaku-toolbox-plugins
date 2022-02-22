const { Vue, appUse, appMount, appUnMount, DataCenter } = window.usePlugin()

const { createApp, defineComponent, ref } = Vue

const loading = ref(false)
const current = ref({})
const animeMedia = ref([])

const animeQuery = `query ($ids: [Int]) {
  Page(page: 1, perPage: 50) {
    media(id_in: $ids, type: ANIME) {
      id
      title {
        native
        romaji
        english
      }
      type
      format
      status
      startDate {
        year
        month
        day
      }
      endDate {
        year
        month
        day
      }
      season
      episodes
      duration
      source
      coverImage {
        large
        medium
      }
      bannerImage
      genres
      synonyms
      studios {
        edges {
          isMain
          node {
            id
            name
            siteUrl
          }
        }
      }
      isAdult
      externalLinks {
        id
        url
        site
      }
      siteUrl
    }
  }
}`

function formatDuration(duration) {
  const list = [
    Math.floor(duration / 3600) % 24,
    ('0' + (Math.floor(duration / 60) % 60)).substr(-2),
    ('0' + Math.floor(duration % 60)).substr(-2),
  ]
  return list.filter((item, index) => item > 0 || index >= 1).join(':')
}

const startPage = defineComponent({
  name: 'AcTraceStartPage',
  template: `<div class="start-page">
  <div class="sticky-t bg-app pb-8" style="z-index: 1;">
    <a-upload draggable
      action="https://api.trace.moe/search?cutBorders"
      method="POST"
      enctype="multipart/form-data"
      name="image"
      style="width: calc(100% - 2px);--color-fill-1: rgba(255, 255, 255, 0.04);"
      :show-file-list="false"
      :on-before-upload="handleBeforeUpload"
      @success="handleUploadSuccess"
      @error="handleUploadError"/>    
    <acg-ratio-div
      v-if="currentImageUrl"
      :ratio="[16,9]"
      class="flex-grow-1 position-absolute w-100"
      style="top: 0; z-index: -1;">
      <img loading="lazy" :src="currentImageUrl">
    </acg-ratio-div>
    <a-input v-model="imageUrl" allow-clear placeholder="也可以输入网络图片地址"/>
    <a-space fill class="mt-8 justify-content-center">
      <a-button @click="fetchBangumi">番剧搜索</a-button>
      <a-button>搜索相似</a-button>
    </a-space>
  </div>
  <span v-show="frames"
    class="px-4 pt-4"
    style="opacity: 0.8;">耗时{{ usedTime }}秒，搜索了{{ frames }}帧</span>
  <a-space fill direction="vertical" class="py-8 px-4">
    <a-card v-for="item of list"
      size="small"
      class="result-card cursor-pointer"
      :bordered="false"
      :class="{selected: item.selected}"
      :title="item.filename"
      :body-style="{padding: 0}"
      @click="handleItemClick(item)">
      <div class="layout-lr">
        <a-space direction="vertical" 
          style="width: 40%;" 
          class="flex-shrink-0 fs-12 pl-8">
          <p style="color: #ff5252;">Episode {{ item.episode }}</p>
          <p style="color: #00b300">{{ formatDuration(item.from) }} - {{ formatDuration(item.to) }}</p>
          <p> ~{{ (item.similarity * 100).toFixed(2) }}% 相似</p>
        </a-space>
        <acg-ratio-div :ratio="[16,9]" class="flex-grow-1">
          <img loading="lazy" :src="item.image">
        </acg-ratio-div>
      </div>
    </a-card>
  </a-space>
</div>`,

  data() {
    return {
      imageUrl: '',
      currentImageUrl: '',
      list: [],
      frames: 0,
      startTime: 0,
      endTime: 0,
    }
  },

  computed: {
    usedTime() {
      return ((this.endTime - this.startTime) / 1000).toFixed(2)
    },
    ids() {
      return Array.from(new Set(this.list.map((item) => item.anilist)))
    },
  },

  methods: {
    formatDuration,
    updateResult(data) {
      data.result.forEach((item) => {
        item.selected = false
      })
      this.list = data.result
      this.frames = data.frameCount
      this.currentImageUrl = this.imageUrl
      if (this.list.length) {
        this.handleItemClick(this.list[0])
      }
    },

    async fetchBangumi() {
      if (this.imageUrl) {
        current.value = {}
        this.frames = 0
        this.startTime = performance.now()
        loading.value = true
        try {
          const resp = await fetch(
            `https://api.trace.moe/search?url=${encodeURIComponent(
              this.imageUrl
            )}`
          )
          const data = await resp.json()
          this.updateResult(data)
          this.fetchAniList()
        } catch (error) {}
        loading.value = false
        this.endTime = performance.now()
      }
    },

    async fetchAniList() {
      const resp = await fetch('https://trace.moe/anilist/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          query: animeQuery,
          variables: { ids: this.ids },
        }),
      })

      const json = await resp.json()
      animeMedia.value = json.data.Page.media
    },

    handleBeforeUpload() {
      this.frames = 0
      this.startTime = performance.now()
      loading.value = true
      current.value = {}
      return Promise.resolve(true)
    },

    handleUploadSuccess(file) {
      this.endTime = performance.now()
      loading.value = false
      const { response: data } = file
      this.updateResult(data)
      this.currentImageUrl = file.url
      this.fetchAniList()
    },

    handleUploadError(file) {
      console.error(file)
    },

    handleItemClick(item) {
      current.value = item
      this.list.forEach((el) => {
        el.selected = el === item
      })
    },
  },
})

const contentNode = defineComponent({
  name: 'AcTraceContentNode',
  template: `<div v-if="data.filename" class="px-8 py-8">
  <a-card :bordered="false" :title="data.filename">
    <template #cover>
      <video :src="data.video"
        :poster="data.image"
        class="w-100"
        volume="0"
        autoplay
        loop></video>
    </template>      
    <a-card-meta>
      <template #description>
        <div class="d-flex">
          <a-slider :default-value="50" disabled/>
          <span class="ml-8 flex-shrink-0">{{ formatDuration(data.from) }}</span>
        </div>
      </template>
    </a-card-meta>
  </a-card>

  <a-card v-if="info.id" class="mt-12" :bordered="false">
    <template #title>
      <p v-if="info.title && info.title.native"
        class="title-native">{{ info.title.native }}</p>
      <p v-if="info.title && info.title.romaji"
        class="title-romaji">{{ info.title.romaji }}</p>
    </template>

    <p v-if="info.synonyms">{{ info.synonyms.join(' / ') }}</p>
    <p v-if="info.title && info.title.chinese"
      class="title-english">{{ info.title.chinese }}</p>
    <p v-if="info.title && info.title.english"
      class="title-english">{{ info.title.english }}</p>
  </a-card>
</div>`,

  computed: {
    data() {
      return current.value
    },
    info() {
      return animeMedia.value.find((item) => item.id === this.data.anilist)
    },
  },

  methods: {
    formatDuration,
  },
})

;(function () {
  const app = createApp({
    name: 'ToolAcTrace',

    components: {
      startPage,
      contentNode,
    },

    data() {
      return {}
    },

    computed: {
      loading() {
        return loading.value
      },
    },

    methods: {},

    template: `<a-spin :loading="loading" class="w-100 h-100">
    <a-layout class="tool-ac-trace h-100">
      <a-layout-sider :width="300">
        <start-page></start-page>
      </a-layout-sider>
      <a-layout-content>
        <content-node></content-node>
      </a-layout-content>
    </a-layout>
  </a-spin>`,
  })
  appUse(app)
  appMount(app)

  const style = document.createElement('style')
  style.innerHTML = `.tool-ac-trace .result-card.selected{
    box-shadow: 0 0 10px var(--app-color-common);
  }`
  document.body.appendChild(style)
})()
