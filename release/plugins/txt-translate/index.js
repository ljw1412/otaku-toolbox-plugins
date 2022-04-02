;(function () {
  const { Vue, VueUse, appUse, appMount, electron } = window.usePlugin()
  const { createApp, defineComponent, ref, reactive } = Vue
  const { watchDebounced, useFileSystemAccess } = VueUse
  const { ipcInvoke } = electron

  const store = reactive({
    text: '',
    translateText: '',
    translate: { youdao: '', baidu: '' },
    list: [],
    loaded: {
      youdao: false,
      baidu: false,
    },
    cur: {
      id: 0,
      text: '',
      translateText: '',
    },
  })

  const fs = useFileSystemAccess({
    dataType: 'Text',
    types: [{ description: '文本', accept: { 'text/plain': ['.txt'] } }],
    excludeAcceptAllOption: true,
  })

  const app = createApp({
    name: 'TxtTranslate',

    compilerOptions: {
      isCustomElement: (tag) => ['webview'].includes(tag),
    },

    template: `<a-layout class="txt-translate h-100">
    <a-layout-sider class="txt-translate-side">
      <div class="action d-flex">
        <acg-ratio-div v-for="item of actions" 
          :key="item.action" 
          :title="item.name"
          class="action-item"
          @click="handleAction(item.action)">
          <component :is="item.icon" :size="20"></component>
        </acg-ratio-div>
      </div>
       <div class="text-list pt-4">
        <div v-for="item of mList" 
          :key="item.id" 
          class="text-item mb-4 px-2 py-4"
          :data-id="item.id"
          :class="{selected: item.id === store.cur.id}"
          :title="item.text + '\\n' + item.translateText"
          @click="handleTextItemClick(item)">
          <div class="text text-truncate">{{ item.text }}</div>
          <div class="text translated text-truncate">{{ item.translateText }}</div>
        </div>
      </div>
    </a-layout-sider>
    <a-layout-content>
      <div class="net-translate px-16 py-12 mb-12">
        <h5 class="mb-8">翻译参考</h5>
        <div class="net-translate-result">
          <div class="translate-item translate-1">
            <a-textarea v-model="store.translate.youdao"
              readonly :auto-size="{minRows:6,maxRows:6}"></a-textarea>
            <div class="title mt-4 layout-lr">
              <div>
                <span class="mr-4">有道翻译</span>
                <a-tag size="small" 
                  :color="store.loaded.youdao?'green':'red'">{{store.loaded.youdao ? '已加载':'未加载' }}</a-tag>
              </div>
              <a-button size="mini" :disabled="!store.translate.youdao"
                @click="handleUseResult('youdao')">采用</a-button>
            </div>
          </div>
          <div class="translate-item translate-2">
            <a-textarea v-model="store.translate.baidu" 
              readonly :auto-size="{minRows:6,maxRows:6}"></a-textarea>
            <div class="title mt-4 layout-lr">
              <div>
                <span class="mr-4">百度翻译</span>
                <a-tag size="small" 
                  :color="store.loaded.baidu?'green':'red'">{{store.loaded.baidu ? '已加载':'未加载' }}</a-tag>
              </div>
              <a-button size="mini" :disabled="!store.translate.baidu" @click="handleUseResult('baidu')">采用</a-button>
            </div>
          </div>
        </div>
      </div>

      <a-form :model="store" 
        layout="vertical" 
        class="px-16 txt-translate-form">
        <a-form-item label="原文">
          <a-textarea v-model="store.text" :auto-size="{minRows:6,maxRows:6}"></a-textarea>
        </a-form-item>
        <a-form-item label="译文">
          <a-textarea v-model="store.translateText" :auto-size="{minRows:6,maxRows:6}"></a-textarea>
        </a-form-item>
      </a-form>

      <div class="txt-translate-action layout-lr px-16">
        <div class="fs-18 font-weight-bold">
          <span v-show="mList.length">{{ curIndex + 1 }} / {{ mList.length }}</span>
        </div>
        <a-button-group>
          <a-button @click="handleSave">保存</a-button>
          <a-button :disabled="curIndex >= 0 && curIndex + 1 >= mList.length" @click="handleSaveAndNext">保存并下一条</a-button>
        </a-button-group>
      </div>

      <webview ref="youdao" src="https://fanyi.youdao.com/" @dom-ready="handleYouDaoDomReady"></webview>
      <webview ref="baidu" src="https://fanyi.baidu.com/"  @dom-ready="handleBaiduDomReady"></webview>
    </a-layout-content>
</a-layout>

<a-modal v-model:visible="revision.isDisplay" 
  modal-class="txt-translate-modal"
  title-align="start"
  :esc-to-close="false"
  :closable="false"
  :on-before-ok="onSaveBeforeOk"
  fullscreen>
    <template #title>
      <div class="layout-lr w-100" style="height: 28px">
        <span>预览保存</span>
        <div>
          <a-switch type="round" v-model="revision.isVertical">
            <template #checked>上下</template>
            <template #unchecked>左右</template>
          </a-switch>
        </div>
      </div>
    </template>
    <div class="txt-translate-revision" :class="{vertical: revision.isVertical}">
      <div v-for="item of revision.list" class="revision-item my-4">
        <template v-if="item.text">
          <div class="origin-text px-4">{{ item.text }}</div>
          <div class="translated-text px-4">{{ item.translateText }}</div>
        </template>
        <div v-else class="wrap-text">·</div>
      </div>
    </div>
</a-modal>`,

    components: {},

    setup() {
      const youdao = ref()
      const baidu = ref()
      return { youdao, baidu }
    },

    data() {
      return {
        store,
        revision: {
          isDisplay: false,
          isVertical: false,
          list: [],
        },
        actions: [
          { name: '新建', icon: 'icon-drive-file', action: 'new' },
          { name: '打开项目', icon: 'icon-folder', action: 'openProject' },
          {
            name: '保存项目',
            icon: 'icon-share-external',
            action: 'saveProject',
          },
          { name: '导入', icon: 'icon-import', action: 'import' },
          { name: '保存', icon: 'icon-save', action: 'save' },
        ],
      }
    },

    computed: {
      mList() {
        return store.list.filter((item) => item.text)
      },
      curIndex() {
        return this.mList.findIndex((item) => item.id === store.cur.id)
      },
    },

    mounted() {
      watchDebounced(
        () => store.text,
        () => {
          this.translate(store.text)
        },
        { debounce: 1000 }
      )
    },

    methods: {
      handleYouDaoDomReady() {
        store.loaded.youdao = true
        console.log('handleYouDaoDomReady')
        // this.youdao.openDevTools()
      },

      handleBaiduDomReady() {
        store.loaded.baidu = true
        console.log('handleBaiduDomReady')
        // this.baidu.openDevTools()
      },

      async handleAction(action) {
        if (action === 'new') {
          if (!store.list.length) return
          this.$modal.confirm({
            title: '新建',
            content: '注意！新建项目会清空现在工作区内的内容！是否继续？',
            onOk: () => {
              store.list = []
              store.text = ''
              store.translateText = ''
            },
          })
        } else if (action === 'openProject') {
          try {
            await fs.open({
              types: [
                {
                  description: '御宅工具箱翻译项目',
                  accept: { 'json/plain': ['.otakufyprj'] },
                },
              ],
            })
            const json = JSON.parse(fs.data.value)
            if (json.type !== 'otaku-tools-text-translate') {
              this.$message.error('不正确的项目文件！')
              return
            }
            if (Array.isArray(json.data)) {
              const result = await new Promise((resolve, reject) => {
                this.$modal.confirm({
                  title: '警告',
                  content: '打开新项目，将会清空当前项目的所有内容？',
                  okText: '清空并打开',
                  cancelText: '取消',
                  onOk: () => {
                    resolve('save')
                  },
                  onCancel: () => {
                    resolve('clean')
                  },
                })
              })
              if (result === 'save') {
                store.list = json.data
              }
            }
          } catch (error) {
            console.error(error)
          }
        } else if (action === 'saveProject') {
          const result = await ipcInvoke('shell', 'saveFile', {
            content: JSON.stringify({
              type: 'otaku-tools-text-translate',
              data: store.list,
            }),
            filters: [
              { name: '御宅工具箱翻译项目', extensions: ['otakufyprj'] },
            ],
          })
          if (result.canceled) {
            this.$message.warning('项目未保存成功！')
          } else if (result.err) {
            this.$message.error('项目保存失败！')
          } else {
            this.$message.success(`项目保存成功：${result.filePath}`)
          }
        } else if (action === 'import') {
          try {
            await fs.open({
              types: [
                { description: '文本', accept: { 'text/plain': ['.txt'] } },
              ],
            })
            const list = fs.data.value.split('\n').map((item, i) => {
              return {
                id: +new Date() + '-' + i,
                text: item.trim(),
                translateText: '',
              }
            })
            console.log(list)
            store.list.push(...list)
          } catch (error) {
            console.error(error)
          }
        } else if (action === 'save') {
          if (!store.list.length) return
          this.revision.isDisplay = true
          this.revision.list = JSON.parse(JSON.stringify(store.list))
        }
      },

      async handleTextItemClick(item) {
        if (item === store.cur) return
        if (store.cur.id && store.cur.translateText !== store.translateText) {
          const result = await new Promise((resolve, reject) => {
            this.$modal.confirm({
              title: '警告',
              content: '你当前的译文未保存？',
              okText: '保存',
              cancelText: '舍弃',
              onOk: () => {
                resolve('save')
              },
              onCancel: () => {
                resolve('clean')
              },
            })
          })
          if (result === 'save') {
            store.cur.text = store.text
            store.cur.translateText = store.translateText
          }
        }
        store.cur = item
        store.text = item.text
        store.translateText = item.translateText
        store.translate.youdao = ''
        store.translate.baidu = ''
      },

      handleUseResult(who) {
        store.translateText = store.translate[who] || ''
      },

      handleSave() {
        console.log(store.cur)
        if (!store.cur.id) {
          const item = {
            id: +new Date(),
            text: store.text,
            translateText: store.translateText,
          }
          store.list.push(item)
          store.cur = item
        } else {
          store.cur.text = store.text
          store.cur.translateText = store.translateText
        }
      },

      handleSaveAndNext() {
        this.handleSave()
        if (this.curIndex + 1 < this.mList.length) {
          const nextItem = this.mList[this.curIndex + 1]
          this.handleTextItemClick(nextItem)
          const el = document.querySelector(`[data-id='${nextItem.id}']`)
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      },

      async onSaveBeforeOk(done) {
        const content = this.revision.list
          .map((item) => item.translateText || item.text)
          .join('\r\n')
        const result = await ipcInvoke('shell', 'saveFile', {
          content,
          filters: [{ name: '文本文件', extensions: ['txt'] }],
        })

        console.log(result)

        done(!result.canceled)
        if (result.canceled) {
          this.$message.warning('未保存成功！')
        } else if (result.err) {
          this.$message.error('保存失败！')
        } else {
          this.$message.success(`保存成功：${result.filePath}`)
        }
      },

      translate(text) {
        console.log('[translate]', text)

        store.loaded.youdao &&
          this.youdao.executeJavaScript(
            `var input = document.querySelector('#inputOriginal');
            var btn = document.querySelector('#transMachine');
          if(input && btn){
            input.value = \`${text}\`;
            btn.click();
          }`
          )
        store.loaded.baidu &&
          this.baidu.executeJavaScript(
            `var input = document.querySelector('#baidu_translate_input');
            var btn = document.querySelector('#translate-button');
          if(input && btn){
            input.value =  \`${text}\`;
            btn.click();
          }`
          )
        setTimeout(this.getTransTarget, 1000)
      },

      async getTransTarget() {
        if (store.loaded.youdao) {
          store.translate.youdao = await this.youdao.executeJavaScript(
            `var el = document.querySelector('#transTarget');
           el? el.innerText : ''`
          )
        }
        if (store.loaded.baidu) {
          store.translate.baidu = await this.baidu.executeJavaScript(
            `var el = document.querySelector('.trans-right .target-output');
           el? el.innerText : ''`
          )
        }
      },
    },
  })
  appUse(app)
  const vm = appMount(app)
})()
