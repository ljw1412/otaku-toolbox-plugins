;(function () {
  const { Vue, appUse, appMount, appUnMount, DataCenter } = window.usePlugin()

  const { createApp, defineComponent, ref, reactive } = Vue

  const store = reactive({
    loading: false,
    currentImageUrl: '',
    list: [],
    currentItem: {},
    animeMediaList: [],
    searchState: {
      frames: 0,
      startTime: 0,
      endTime: 0,
    },
  })

  const loading = ref(false)
  const currentItem = ref({})
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

  function updateResult(data) {
    console.log(data)
    if (data.error) {
      console.log(vm)
      vm.$message.error(data.error)
      return
    }

    const ids = Array.from(new Set(data.result.map((item) => item.anilist)))
    fetchAniList(ids)

    data.result.forEach((item) => {
      item.selected = false
    })
    store.list = data.result
    store.searchState.frames = data.frameCount
    if (store.list.length) {
      store.currentItem = store.list[0]
      store.list.forEach((el) => {
        el.selected = el === store.list[0]
      })
    }
  }

  async function uploadImage(imageBlob) {
    store.currentItem = {}
    store.searchState = {
      frames: 0,
      startTime: performance.now(),
      endTime: 0,
    }
    store.loading = true
    const formData = new FormData()
    formData.append('image', imageBlob)
    const data = await fetch('https://api.trace.moe/search?cutBorders', {
      method: 'POST',
      body: formData,
    }).then((e) => e.json())
    store.loading = false
    store.searchState.endTime = performance.now()
    store.currentImageUrl = URL.createObjectURL(imageBlob)
    updateResult(data)
  }

  async function fetchBangumi(imageUrl) {
    if (imageUrl) {
      store.currentItem = {}
      store.searchState = {
        frames: 0,
        startTime: performance.now(),
        endTime: 0,
      }
      store.loading = true
      try {
        const resp = await fetch(
          `https://api.trace.moe/search?url=${encodeURIComponent(imageUrl)}`
        )
        const data = await resp.json()
        updateResult(data)
      } catch (error) {}
      store.loading = false
      store.searchState.endTime = performance.now()
      store.currentImageUrl = imageUrl
    }
  }

  // 根据id获取动漫详情
  async function fetchAniList(ids) {
    const resp = await fetch('https://trace.moe/anilist/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query: animeQuery,
        variables: { ids },
      }),
    })
    const json = await resp.json()
    store.animeMediaList = json.data.Page.media
  }

  async function fetchImage(url) {
    try {
      const resp = await fetch(url)
      return resp.blob()
    } catch (error) {
      return null
    }
  }

  const startPage = defineComponent({
    name: 'AcTraceStartPage',
    template: `<div class="start-page">
  <div class="sticky-t bg-app pb-8" style="z-index: 1;">
    <a-input-search v-model="imageUrl" allow-clear placeholder="也可以输入网络图片地址" @search="fetchBangumi" @press-enter="fetchBangumi"/>
    <acg-ratio-div v-if="store.currentImageUrl"
      class="origin-image-preview"
      :ratio="[16,9]">
      <img loading="lazy" :src="store.currentImageUrl">
    </acg-ratio-div>
    <div v-show="store.searchState.frames"
      class="px-6 pt-6"
      style="opacity: 0.8;">耗时 {{ usedTime }} 秒，搜索了 {{ store.searchState.frames }} 帧</div>
  </div>
  <a-space fill direction="vertical" class="py-8 px-4">
    <a-card v-for="item of store.list"
      size="small"
      class="result-card cursor-pointer"
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
        store,
        imageUrl: '',
      }
    },

    computed: {
      usedTime() {
        return (
          (store.searchState.endTime - store.searchState.startTime) /
          1000
        ).toFixed(2)
      },
    },

    methods: {
      formatDuration,

      fetchBangumi() {
        fetchBangumi(this.imageUrl)
      },

      handleItemClick(item) {
        store.currentItem = item
        store.list.forEach((el) => {
          el.selected = el === item
        })
      },
    },
  })

  const fullScreenUpload = defineComponent({
    name: 'AcTraceFullScreenUpload',
    template: `<div v-show="visible"
    class="full-screen-upload"
    @dragleave="handleDragleave"
    @dragover.prevent
    @drop="handleDrop">
    <div class="tips m-auto">
      <icon-upload style="font-size: 80px;" />
      <div class="mt-8">松手以上传(仅限图片格式)</div>
    </div>
  </div>`,

    props: { visible: Boolean },

    emits: ['update:visible'],

    data() {
      return {}
    },

    methods: {
      handleDragleave(e) {
        this.$emit('update:visible', false)
        console.log('Dragleave', e)
      },

      async handleDrop(e) {
        console.log('Drop', e)
        const file = event.dataTransfer.files[0]
        if (file) {
          console.log('上传文件', file)
          if (!file.type.startsWith('image')) {
            this.$message.error('Master! 我无法识别该文件类型！')
          } else {
            uploadImage(file)
          }
        } else if (event.dataTransfer.items.length) {
          const items = Array.from(event.dataTransfer.items)
          const result = await Promise.all(
            items.map(
              async (item) =>
                new Promise((resolve, reject) => item.getAsString(resolve))
            )
          )
          if (result.some((item) => item.includes('<img '))) {
            const imgBlob = await fetchImage(result[0])
            if (imgBlob) {
              uploadImage(imgBlob)
            } else {
              this.$message.error('Master! 这张图片好像有什么封印！')
            }
          } else {
            this.$message.error('Master! 你在我身上放了什么我不知道的东西？！')
          }
        } else {
          this.$message.error('(((φ(◎ロ◎;)φ)))未知的拖拽行为！')
        }
        this.$emit('update:visible', false)
      },
    },
  })

  const contentNode = defineComponent({
    name: 'AcTraceContentNode',
    template: `<div v-if="data.filename" class="px-8 py-8">
  <a-card :title="data.filename">
    <template #cover>
      <video :src="videoBlob"
        :poster="data.image"
        class="w-100"
        volume="0"
        autoplay
        loop></video>
    </template>      
    <a-card-meta>
      <template #description>
        <div class="d-flex">
          <a-slider disabled
          :model-value="data.from"
          :max="duration"
          :format-tooltip="formatDuration"/>
          <div class="ml-8 flex-shrink-0">          
            <span>{{ formatDuration(data.from) }}</span>
            <span class="mx-2">/</span>
            <span>{{ formatedDuration }}</span>
          </div>
        </div>
      </template>
    </a-card-meta>
  </a-card>

  <a-card v-if="info && info.id" class="mt-12">
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

    data() {
      return {
        videoBlob: '',
        duration: 0,
      }
    },

    computed: {
      data() {
        return store.currentItem
      },
      info() {
        return store.animeMediaList.find(
          (item) => item.id === this.data.anilist
        )
      },
      formatedDuration() {
        return this.formatDuration(this.duration)
      },
    },

    watch: {
      data() {
        this.loadVideoInfo()
      },
    },

    methods: {
      formatDuration,

      async loadVideoInfo() {
        this.videoBlob = ''
        if (this.data.video) {
          const resp = await fetch(this.data.video)
          const blob = await resp.blob()
          this.duration = parseFloat(resp.headers.get('x-video-duration'))
          this.videoBlob = URL.createObjectURL(blob)
        }
      },
    },
  })

  const app = createApp({
    name: 'ToolAcTrace',

    template: `<a-spin class="tool-ac-trace w-100 h-100"
      :loading="store.loading"
      :class="{dragging}"
      @dragenter="handleDragenter">
    <full-screen-upload v-model:visible="dragging"></full-screen-upload>
    <a-layout class="h-100">
      <a-layout-sider :width="300">
        <start-page></start-page>
      </a-layout-sider>
      <a-layout-content>
        <content-node></content-node>
      </a-layout-content>
    </a-layout>
</a-spin>`,

    components: {
      startPage,
      contentNode,
      fullScreenUpload,
    },

    data() {
      return { store, dragging: false }
    },

    methods: {
      handleDragenter(e) {
        if (store.loading) return
        this.dragging = true
        console.log('Dragenter', e)
      },
    },
  })
  appUse(app)
  const vm = appMount(app)
})()
