;(function () {
  const { Vue, VueUse, appUse, appMount, electron } = window.usePlugin()
  const { createApp, defineComponent, ref, reactive } = Vue
  const {
    watchDebounced,
    useFileSystemAccess,
    useClipboard,
    useLocalStorage,
    get,
  } = VueUse
  const { ipcInvoke } = electron
  const baiduLanguageList = getBaiduLanguageList()
  window.debugTxtTranslate = ref(false)

  const config = get(
    useLocalStorage('PLUGIN_TXT-TRANSLATE', {
      revision: {
        isCompare: false,
        isVertical: false,
      },
    })
  )

  const engines = ['youdao', 'baidu']
  const store = reactive({
    text: '',
    translateText: '',
    youdao: {
      isLoaded: false,
      isError: false,
      isTranslating: false,
      default: false,
      targetText: '',
      languageList: [],
      language: '',
      targetLanguageList: [],
      targetLanguage: '',
      tryTime: 0,
      delay: 1800,
    },
    baidu: {
      isLoaded: false,
      isError: false,
      isTranslating: false,
      default: false,
      targetText: '',
      languageList: baiduLanguageList,
      language: '',
      targetLanguageList: baiduLanguageList.slice(1),
      targetLanguage: '',
      tryTime: 0,
      delay: 1800,
    },
    list: [],
    cur: {
      id: 0,
      text: '',
      translateText: '',
    },
  })

  const clipboard = useClipboard()

  const fs = useFileSystemAccess({
    dataType: 'Text',
    types: [{ description: '文本', accept: { 'text/plain': ['.txt'] } }],
    excludeAcceptAllOption: true,
  })

  function clearStore() {
    store.text = ''
    store.translateText = ''
    store.youdao.targetText = ''
    store.baidu.targetText = ''
    store.list = []
    store.cur = { id: 0, text: '', translateText: '' }
  }

  function uuid() {
    return 'xxxx-xxxx-yxxx-xxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0,
        v = c == 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  const app = createApp({
    name: 'TxtTranslate',

    compilerOptions: {
      isCustomElement: (tag) => ['webview'].includes(tag),
    },

    template: `<a-layout class="txt-translate h-100">
    <a-layout-sider class="txt-translate-side" :width="330">
      <div class="action d-flex align-items-center">
        <acg-ratio-div v-for="item of actions" 
          :key="item.action" 
          :title="item.name"
          class="action-item"
          :class="{ null: !item.name, disabled: item.disabled }"
          @click="handleAction(item.action)">
          <component :is="item.icon" :size="20"></component>
        </acg-ratio-div>
        <div v-if="hasNoTranslated" class="quick-btns">
          <a-divider direction="vertical" />
          <a-button size="small" 
            @click="handleShowTranslateDialog">一键机翻</a-button>
        </div>
      </div>
      <div class="text-list pt-4">
        <div v-for="item of mList" 
          :key="item.id" 
          class="text-item mb-4 px-2 py-4"
          :data-id="item.id"
          :class="{selected: item.id === store.cur.id}"
          :title="item.text + '\\n' + item.translateText"
          @click="handleTextItemClick(item)">
            <div class="text">{{ item.text }}</div>
            <div class="text translated">{{ item.translateText }}</div>
          </div>
      </div>
    </a-layout-sider>

    <a-layout-content class="d-flex flex-column">
      <a-form :model="store" 
        layout="vertical" 
        class="txt-translate-form px-16 mt-12 flex-grow-1">
        <a-form-item :label-attrs="{class: 'w-100'}" label-component="div">
          <template #label>
            <div class="layout-lr">
              <span>原文</span>
              <a-button size="mini" @click="handleTextCopyClick">
                {{textCopied?'已复制':'复制'}}
              </a-button>
            </div>  
          </template>
          <a-textarea v-model="store.text"
            :auto-size="{minRows:5,maxRows:5}"
            class="core-textarea origin-textarea"></a-textarea>
        </a-form-item>
        <a-form-item label="译文">
          <a-textarea v-model="store.translateText"
            :auto-size="{minRows:5,maxRows:5}"
            class="core-textarea translated-textarea"></a-textarea>
        </a-form-item>
        <div class="txt-translate-action layout-lr px-16">
          <div class="fs-18 font-weight-bold">
            <span v-show="mList.length">{{ curIndex + 1 }} / {{ mList.length }}</span>
            <a-button-group v-show="mList.length" class="ml-8">
              <a-button size="medium" :disabled="curIndex <= 0" @click="handleCurMove(-1)">
                <template #icon><icon-caret-up /></template>
              </a-button>
              <a-button size="medium" :disabled="curIndex >= mList.length -1 " @click="handleCurMove(1)">
                <template #icon><icon-caret-down /></template>
              </a-button>
            </a-button-group>
          </div>
          <a-button-group>
            <a-button @click="handleSave">保存</a-button>
            <a-button :disabled="curIndex >= 0 && curIndex + 1 >= mList.length" @click="handleSaveAndNext">保存并下一条</a-button>
          </a-button-group>
        </div>
      </a-form>

      <div class="net-translate px-16 py-12 mt-12 flex-shrink-0">
        <h5 class="mb-8">
          <span>翻译参考</span>
          <component v-if="debugTxtTranslate" 
            class="ml-4 cursor-pointer"
            :is="isDisplayWebview ? 'icon-eye' : 'icon-eye-invisible'"
            @click="isDisplayWebview = !isDisplayWebview">
          </component>
        </h5>
        <div class="net-translate-result">
          <div class="translate-item translate-1 pr-6">
            <div class="title mb-4 layout-lr">
              <div>
                <a-tag size="medium" 
                :color="store.youdao.isLoaded?'green':'red'">
                  <icon-close v-if="store.youdao.isError"/>
                  <icon-loading v-else-if="!store.youdao.isLoaded"/>
                  <span style="padding: 0 2px;">有道翻译</span>
                  <icon-loading v-if="store.youdao.isTranslating"/>
                </a-tag>
                <a-divider direction="vertical" />
                <a-tag checkable 
                  size="small"
                  color="arcoblue"
                  :checked="store.youdao.default" 
                  @check="hadnleChangeDefaultUse('youdao')">默认采用</a-tag>
              </div>
              <a-space size="mini">
                <a-button size="mini" @click="getTransTargetYoudao">获取</a-button>
                <a-button size="mini" :disabled="!store.youdao.targetText"
                  @click="handleUseResult('youdao')">采用</a-button>
              </a-space>
            </div>
            <a-textarea v-model="store.youdao.targetText"
              readonly :auto-size="{minRows:6,maxRows:6}"></a-textarea>
            <div class="layout-lr mt-4">
              <a-select v-model="store.youdao.language"
                allow-search
                size="mini" 
                style="width: 160px;"
                @change="handleYouDaoLanguageChange('From',$event)">
                <a-option v-for="item of store.youdao.languageList"
                  :disabled="item.value === store.youdao.targetLanguage"
                  :key="item.value" :label="item.name" :value="item.value">
                </a-option>
              </a-select>
              <icon-double-right class="mx-8"/>
              <a-select v-model="store.youdao.targetLanguage"
                allow-search
                size="mini" 
                style="width: 160px;"
                :disabled="store.youdao.language === 'AUTO'"
                @change="handleYouDaoLanguageChange('To',$event)">
                <a-option v-for="item of store.youdao.targetLanguageList"
                  :disabled="item.value === store.youdao.language"
                  :key="item.value" :label="item.name" :value="item.value">
                </a-option>
              </a-select>
            </div>
          </div>
          <div class="translate-item translate-2 pl-6">
            <div class="title mb-4 layout-lr">
              <div>
                <a-tag size="medium" 
                  :color="store.baidu.isLoaded?'green':'red'">
                  <icon-close v-if="store.baidu.isError"/>
                  <icon-loading v-else-if="!store.baidu.isLoaded"/>
                  <span style="padding: 0 2px;">百度翻译</span>
                  <icon-loading v-if="store.baidu.isTranslating"/>
                </a-tag>
                <a-divider direction="vertical" />
                <a-tag checkable 
                  size="small"
                  color="arcoblue"
                  :checked="store.baidu.default"
                  @check="hadnleChangeDefaultUse('baidu')">默认采用</a-tag>
              </div>
              <a-space size="mini">
                <a-button size="mini" @click="getTransTargetBaidu">获取</a-button>
                <a-button size="mini" :disabled="!store.baidu.targetText" @click="handleUseResult('baidu')">采用</a-button>
              </a-space>
            </div>
            <a-textarea v-model="store.baidu.targetText" 
              readonly :auto-size="{minRows:6,maxRows:6}"></a-textarea>
              <div class="layout-lr mt-4">
                <a-select v-model="store.baidu.language"
                  allow-search
                  size="mini" 
                  style="width: 160px;"
                  @change="handleBaiduLanguageChange('from',$event)">
                  <a-option v-for="item of store.baidu.languageList"
                    :disabled="item.value === store.baidu.targetLanguage"
                    :key="item.value" :label="item.name" :value="item.value">
                  </a-option>
                </a-select>
                <icon-double-right class="mx-8"/>
                <a-select v-model="store.baidu.targetLanguage"
                  allow-search
                  size="mini" 
                  style="width: 160px;"
                  @change="handleBaiduLanguageChange('to',$event)">
                  <a-option v-for="item of store.baidu.targetLanguageList"
                    :disabled="item.value === store.baidu.language"
                    :key="item.value" :label="item.name" :value="item.value">
                  </a-option>
                </a-select>
              </div>
            </div>
          </div>
        </div>

      <div v-show="debugTxtTranslate && isDisplayWebview" class="webviews">
        <webview ref="youdao" src="https://fanyi.youdao.com/" @dom-ready="handleYouDaoDomReady"></webview>
        <webview ref="baidu" src="https://fanyi.baidu.com/#jp/zh/"  @dom-ready="handleBaiduDomReady"></webview>
      </div>
    </a-layout-content>
</a-layout>

<a-modal v-model:visible="isDisplayImport" title="导入文本" simple>
  <a-textarea v-model="importText" :auto-size="{minRows:15,maxRows:15}"></a-textarea>
  <template #footer>
    <div class="layout-lr w-100">
      <a-button @click="handleAction('import')">
        <template #icon><icon-file /></template>打开文件
      </a-button>
      <a-button type="primary"
        :disabled="!importText.trim().length" 
        @click="handleImportText">
        <template #icon><icon-import /></template>导入
      </a-button>
    </div>
  </template>
</a-modal>

<a-modal v-model:visible="machineTranslation.isDisplay"
  simple
  title="一键机翻"
  :mask-closable="false"
  :footer="false">
    <a-form v-if="!machineTranslation.isTranslating" :model="machineTranslation" 
      :label-col-props="{ span:8 }"
      :wrapper-col-props="{ span:16 }">
      <a-form-item label="未翻译的文本数">
        <div>{{ machineTranslation.list.length }}条</div>
      </a-form-item>
      <a-form-item label="翻译数量">
        <a-radio-group v-model="machineTranslation.isAll">
          <a-radio :value="true">全部</a-radio>
          <a-radio :value="false">  
            <a-input-number v-model="machineTranslation.count" 
              size="small"
              :style="{width:'80px'}"
              :min="1" :max="9999"
              :default-value="10"
              placeholder="翻译数量"/>
          </a-radio>
        </a-radio-group>
      </a-form-item>
      <a-form-item label="翻译引擎">
        <a-radio-group v-model="machineTranslation.engine" type="button">
          <a-radio value="youdao">有道</a-radio>
          <a-radio value="baidu">百度</a-radio>
        </a-radio-group>
      </a-form-item>
      <a-form-item label="翻译延迟">
        <a-input-number v-model="machineTranslation.during" 
          style="width: 100px;"
          :default-value="500" 
          :step="100"/>
      </a-form-item>
      <a-space class="justify-content-center">
        <a-button @click="machineTranslation.isDisplay = false">取消</a-button>
        <a-button type="primary" @click="handleStartTranslateClick">开始</a-button>
      </a-space>
    </a-form>
      <div v-else class="text-center">
        <a-spin :size="32"></a-spin>
        <div class="text-truncate">
          {{machineTranslation.current.text}}
        </div>
        <div class="fs-32">{{ machineTranslation.index }}/{{  machineTranslation.isAll ? machineTranslation.list.length : machineTranslation.count }}</div>
        <a-button type="outline" status="danger" @click="stopStepTranslate">取消</a-button>
      </div>
</a-modal>

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
        <div class="layout-lr">
          <a-switch v-if="config.revision.isCompare" 
            v-model="config.revision.isVertical"
            type="round">
            <template #checked>上下</template>
            <template #unchecked>左右</template>
          </a-switch>
          <a-checkbox v-model="config.revision.isCompare">对比模式</a-checkbox>
        </div>
      </div>
    </template>
    <div class="txt-translate-revision" :class="{vertical: config.revision.isVertical}">
      <div v-for="item of revision.list" class="revision-item my-4">
        <template v-if="!config.revision.isCompare">
          <div class="px-4 w-100" 
            :class="item.translateText ? 'translated-text' : 'origin-text'">
            {{ item.translateText || item.text}}
          </div>
        </template>
        <template v-else-if="item.text">
          <div class="origin-text px-4">{{ item.text }}</div>
          <div class="translated-text px-4">{{ item.translateText }}</div>
        </template>
        <div v-else class="wrap-text"></div>
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
          list: [],
        },
        isDisplayWebview: true,
        isDisplayImport: false,
        machineTranslation: {
          isDisplay: false,
          isTranslating: false,
          index: 1,
          isAll: true,
          count: 10,
          engine: 'youdao',
          current: {},
          list: [],
          timer: null,
          during: 1000,
        },
        importText: '',
      }
    },

    computed: {
      config() {
        return config
      },
      mList() {
        return store.list.filter((item) => item.text)
      },
      curIndex() {
        return this.mList.findIndex((item) => item.id === store.cur.id)
      },
      debugTxtTranslate() {
        return window.debugTxtTranslate.value
      },
      textCopied() {
        return clipboard.copied.value
      },
      hasNoTranslated() {
        return this.mList.some((item) => !item.translateText)
      },
      actions() {
        return [
          { name: '新建', icon: 'icon-drive-file', action: 'new' },
          { name: '打开项目', icon: 'icon-folder', action: 'openProject' },
          {
            name: '保存项目',
            icon: 'icon-share-external',
            action: 'saveProject',
            disabled: !store.list.length,
          },
          { name: '导入', icon: 'icon-import', action: 'importDialog' },
          {
            name: '保存',
            icon: 'icon-save',
            action: 'save',
            disabled: !store.list.length,
          },
        ]
      },
    },

    mounted() {
      watchDebounced(
        () => store.text,
        () => {
          if (store.text) {
            this.translate(store.text)
          } else {
            this.store.youdao.targetText = ''
            this.store.baidu.targetText = ''
          }
        },
        { debounce: 1000 }
      )
    },

    methods: {
      async handleYouDaoDomReady() {
        // await this.youdao.openDevTools()
        const clicked = await this.youdao.executeJavaScript(
          `
            var fromel = document.querySelector('.lanFrom-container');
            if(fromel) fromel.click();
            !!fromel;
          `
        )
        console.log('handleYouDaoDomReady:clicked', clicked)
        if (clicked) {
          const { languageList, language, targetLanguage } = await this.youdao
            .executeJavaScript(`
            var items = document.querySelectorAll('.complex-container .specify-language-container .language-item')

            var languageList = [
              {name:'自动选择语言',value:'AUTO'},
              ...Array.from(items).map(item=>{
              const code = item.dataset.code || 'AUTO'
              return {
                name:item.textContent,
                value: code
              }
            })]

            function getCurrentLang() {
              const fromEl = document.querySelector('.lanFrom-container') || {}
              const toEl = document.querySelector('.lanTo-container') || {}
              const languageItem = languageList.find(item=>item.name === fromEl.textContent)
              const targetLanguageItem = languageList.find(item=>item.name === toEl.textContent)
              return {
                language: languageItem ? languageItem.value : '',
                targetLanguage:targetLanguageItem ? targetLanguageItem.value : '',
              }
            }
            

            const data ={...getCurrentLang() , languageList };
            setTimeout(() => {document.body.click();}, 300)
            data;
            `)

          console.log('handleYouDaoDomReady', languageList, language)
          store.youdao.language = language
          store.youdao.languageList = languageList
          store.youdao.targetLanguage = targetLanguage
          store.youdao.targetLanguageList = languageList

          store.youdao.isLoaded = true
          console.log('YouDao is Ready')
        } else if (store.youdao.tryTime < 3) {
          store.youdao.tryTime++
          setTimeout(() => {
            this.handleYouDaoDomReady()
          }, 1500)
          console.log(`handleYouDaoDomReady ${store.youdao.tryTime}`, '重试')
        } else {
          store.youdao.isError = true
        }
      },

      async handleBaiduDomReady() {
        const isBackOld = await this.baidu.executeJavaScript(`
          var backOldEl = $('span:contains("返回旧版")');
          if(backOldEl.length) backOldEl.click();
          !backOldEl.length
        `)
        console.log(
          'handleBaiduDomReady',
          isBackOld ? '切换回旧版' : '未找到旧版按钮'
        )

        const { langMap, error, language, targetLanguage } = await this.baidu
          .executeJavaScript(`
          var langMap = window.langMap;
          var form = document.querySelector('.select-from-language .language-selected'); 
          var to = document.querySelector('.select-to-language .language-selected');
          ({
            langMap,
            error: !form||!to,
            language: form ? form.dataset.lang : '',
            targetLanguage: to ? to.dataset.lang : ''
          })
        `)

        if (!error) {
          store.baidu.language = language
          store.baidu.targetLanguage = targetLanguage
          console.log('Baidu is Ready', { langMap, language, targetLanguage })
          store.baidu.isLoaded = true
        } else if (store.baidu.tryTime < 3) {
          store.baidu.tryTime++
          setTimeout(() => {
            this.handleBaiduDomReady()
          }, 1500)
          console.log(`handleBaiduDomReady ${store.baidu.tryTime}`, '重试')
        } else {
          store.baidu.isError = true
        }

        // this.baidu.openDevTools()
      },

      async handleYouDaoLanguageChange(who, lang) {
        const item = store.youdao.languageList.find(
          (item) => item.value === lang
        )
        console.log('[有道切换语言]', who, lang, item)
        const selectName = `.lan${who}-container`
        const clicked = await this.youdao.executeJavaScript(
          `
            var fromel = document.querySelector('${selectName}');
            if(fromel) fromel.click();
            !!fromel;
          `
        )
        console.log('YouDao:clicked', clicked)
        if (clicked) {
          await this.youdao.executeJavaScript(
            `var items = Array.from(document.querySelectorAll('.complex-container .language-item'));
            var el = items.find(el=>el.dataset.code === '${item.value}') || items[0];
            el.click();
          `
          )
          const { language, targetLanguage } =
            await this.youdao.executeJavaScript(`getCurrentLang();`)
          console.log('YouDao:changed', language, targetLanguage)
          store.youdao.language = language
          store.youdao.targetLanguage = targetLanguage
        }

        setTimeout(this.getTransTargetYoudao, store.youdao.delay)
      },

      async handleBaiduLanguageChange(who, lang) {
        const item = store.baidu.languageList.find(
          (item) => item.value === lang
        )
        console.log('[百度切换语言]', who, lang, item)
        const selectName = `.select-${who}-language`
        await this.baidu.executeJavaScript(
          `var selectEl = document.querySelector("${selectName}");
          console.log(selectEl);
          selectEl && (selectEl.click());
          setTimeout(()=>{
            var langItem = Array.from(document.querySelectorAll(".lang-panel .lang-item")).find(el=>el.innerHTML === '${item.name}');
            console.log(langItem);
            langItem && (langItem.click());
          },300);`
        )
        setTimeout(this.getTransTargetBaidu, store.baidu.delay)
      },

      appendItemByText(text) {
        const list = text.split('\n').map((item, i) => {
          return {
            id: uuid(),
            text: item.trim(),
            translateText: '',
          }
        })
        console.log(list)
        store.list.push(...list)
      },

      loadProjectData(json) {
        clearStore()
        store.list = json.data
        console.log(json)
        if (json.cursor) {
          this.$nextTick(() => {
            const targetItem = store.list.find(
              (item) => item.id === json.cursor
            )
            targetItem && this.handleTextItemClick(targetItem)
            this.scrollToTargetItem(targetItem)
          })
        }
      },

      async handleAction(action) {
        if (action === 'new') {
          if (!store.list.length) return
          this.$modal.confirm({
            title: '新建',
            content: '注意！新建项目会清空现在工作区内的内容！是否继续？',
            onOk: () => {
              clearStore()
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
            if (Array.isArray(json.data) && json.data.length) {
              if (!store.list.length) {
                this.loadProjectData(json)
                return
              }
              this.$modal.confirm({
                title: '警告',
                content: '打开新项目，将会清空当前项目的所有内容？',
                okText: '清空并打开',
                cancelText: '取消',
                onOk: () => {
                  this.loadProjectData(json)
                },
                onCancel: () => {},
              })
            } else {
              this.$message.error('未在项目文件中找到文本项')
            }
          } catch (error) {
            console.error(error)
          }
        } else if (action === 'saveProject') {
          if (!store.list.length) return
          console.log(store.list)
          const result = await ipcInvoke('shell', 'saveFile', {
            content: JSON.stringify({
              type: 'otaku-tools-text-translate',
              cursor: store.cur.id,
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
        } else if (action === 'importDialog') {
          this.isDisplayImport = true
        } else if (action === 'import') {
          try {
            await fs.open({
              types: [
                { description: '文本', accept: { 'text/plain': ['.txt'] } },
              ],
            })
            this.appendItemByText(fs.data.value)
            this.isDisplayImport = false
          } catch (error) {
            console.error(error)
          }
        } else if (action === 'save') {
          if (!store.list.length) return
          this.revision.isDisplay = true
          this.revision.list = JSON.parse(JSON.stringify(store.list))
        }
      },

      handleImportText() {
        this.appendItemByText(this.importText)
        this.importText = ''
        this.isDisplayImport = false
      },

      handleShowTranslateDialog() {
        this.machineTranslation.list = this.mList.filter(
          (item) => !item.translateText
        )
        this.machineTranslation.isDisplay = true
      },

      stopStepTranslate() {
        this.machineTranslation.isDisplay = false
        this.machineTranslation.isTranslating = false
        this.machineTranslation.current = {}
        clearInterval(this.machineTranslation.timer)
        this.machineTranslation.timer = null
      },

      async stepTranslate() {
        const list = this.machineTranslation.list
        if (this.machineTranslation.current.translateText === '') {
          return
        } else {
          this.machineTranslation.index++
        }
        if (
          this.machineTranslation.index > list.length ||
          (!this.machineTranslation.isAll &&
            this.machineTranslation.index > this.machineTranslation.count)
        ) {
          return this.stopStepTranslate()
        }

        const { engine, index } = this.machineTranslation
        this.machineTranslation.current = list[index - 1]
        const text = this.machineTranslation.current.text
        console.log('一键翻译', `[${index}/${list.length}]`, text)
        if (engine === 'youdao') {
          await this.translateYoudao(text)
        } else if (engine === 'baidu') {
          await this.translateBaidu(text)
        }
      },

      async handleStartTranslateClick() {
        this.machineTranslation.isTranslating = true
        this.machineTranslation.index = 0
        await this.stepTranslate()
        this.machineTranslation.timer = setInterval(
          this.stepTranslate,
          this.machineTranslation.during
        )
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
        store.youdao.targetText = ''
        store.baidu.targetText = ''
      },

      hadnleChangeDefaultUse(who) {
        if (!engines.includes(who)) return
        if (store[who].default) {
          store[who].default = false
          return
        }
        engines.forEach((name) => {
          store[name].default = name === who
        })
      },

      handleUseResult(who) {
        store.translateText = store[who].targetText || ''
      },

      handleTextCopyClick() {
        clipboard.copy(store.text)
        console.log(clipboard)
      },

      scrollToTargetItem(targetItem) {
        const el = document.querySelector(`[data-id='${targetItem.id}']`)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      },

      handleCurMove(offset) {
        if (
          this.curIndex + offset < this.mList.length &&
          this.curIndex + offset >= 0
        ) {
          const targetItem = this.mList[this.curIndex + offset]
          this.handleTextItemClick(targetItem)
          this.scrollToTargetItem(targetItem)
        }
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
          this.handleCurMove(1)
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

      async translateYoudao(text) {
        if (!store.youdao.isLoaded) return
        store.youdao.isTranslating = true
        await this.youdao.executeJavaScript(
          `var input = document.querySelector('#js_fanyi_input');
          if(input){
            input.innerHTML = '';
            input.focus()
            document.execCommand('insertText', false, \`${text}\`)
            document.body.click();
          }`
        )
        setTimeout(this.getTransTargetYoudao, store.youdao.delay)
      },

      async translateBaidu(text) {
        if (!store.baidu.isLoaded) return
        store.baidu.isTranslating = true
        await this.baidu.executeJavaScript(
          `var input = document.querySelector('#baidu_translate_input');
          var btn = document.querySelector('#translate-button');
        if(input && btn){
          input.value =  \`${text}\`;
          btn.click();
        }`
        )
        setTimeout(this.getTransTargetBaidu, store.baidu.delay)
      },

      async getTransTargetYoudao() {
        if (store.youdao.isLoaded) {
          const result = await this.youdao.executeJavaScript(
            `Array.from(document.querySelectorAll('#js_fanyi_output_resultOutput p')).map(item=>item.innerText).join('')`
          )
          if (this.machineTranslation.isTranslating) {
            this.machineTranslation.current.translateText = result
            return
          }
          store.youdao.targetText = result
          if (store.youdao.default && !store.translateText) {
            store.translateText = store.youdao.targetText
          }
          store.youdao.isTranslating = false
        }
      },

      async getTransTargetBaidu() {
        if (store.baidu.isLoaded) {
          const result = await this.baidu.executeJavaScript(
            `Array.from(document.querySelectorAll('.trans-right .target-output')).map(item=>item.innerText).join('\\n')`
          )

          if (this.machineTranslation.isTranslating) {
            this.machineTranslation.current.translateText = result
            return
          }
          store.baidu.targetText = result
          if (store.baidu.default && !store.translateText) {
            store.translateText = store.baidu.targetText
          }
          store.baidu.isTranslating = false
        }
      },

      translate(text) {
        console.log('[translate]', text)
        this.translateYoudao(text)
        this.translateBaidu(text)
      },
    },
  })
  appUse(app)
  const vm = appMount(app)
})()

function getBaiduLanguageList() {
  return [
    { name: '自动检测', value: 'auto' },
    { name: '中文(简体)', value: 'zh' },
    { name: '英语', value: 'en' },
    { name: '日语', value: 'jp' },
    { name: '泰语', value: 'th' },
    { name: '西班牙语', value: 'spa' },
    { name: '阿拉伯语', value: 'ara' },
    { name: '法语', value: 'fra' },
    { name: '韩语', value: 'kor' },
    { name: '俄语', value: 'ru' },
    { name: '德语', value: 'de' },
    { name: '葡萄牙语', value: 'pt' },
    { name: '意大利语', value: 'it' },
    { name: '希腊语', value: 'el' },
    { name: '荷兰语', value: 'nl' },
    { name: '波兰语', value: 'pl' },
    { name: '芬兰语', value: 'fin' },
    { name: '捷克语', value: 'cs' },
    { name: '保加利亚语', value: 'bul' },
    { name: '丹麦语', value: 'dan' },
    { name: '爱沙尼亚语', value: 'est' },
    { name: '匈牙利语', value: 'hu' },
    { name: '罗马尼亚语', value: 'rom' },
    { name: '斯洛文尼亚语', value: 'slo' },
    { name: '瑞典语', value: 'swe' },
    { name: '越南语', value: 'vie' },
    { name: '中文(粤语)', value: 'yue' },
    { name: '中文(繁体)', value: 'cht' },
    { name: '中文(文言文)', value: 'wyw' },
    { name: '南非荷兰语', value: 'afr' },
    { name: '阿尔巴尼亚语', value: 'alb' },
    { name: '阿姆哈拉语', value: 'amh' },
    { name: '亚美尼亚语', value: 'arm' },
    { name: '阿萨姆语', value: 'asm' },
    { name: '阿斯图里亚斯语', value: 'ast' },
    { name: '阿塞拜疆语', value: 'aze' },
    { name: '巴斯克语', value: 'baq' },
    { name: '白俄罗斯语', value: 'bel' },
    { name: '孟加拉语', value: 'ben' },
    { name: '波斯尼亚语', value: 'bos' },
    { name: '缅甸语', value: 'bur' },
    { name: '加泰罗尼亚语', value: 'cat' },
    { name: '宿务语', value: 'ceb' },
    { name: '克罗地亚语', value: 'hrv' },
    { name: '世界语', value: 'epo' },
    { name: '法罗语', value: 'fao' },
    { name: '菲律宾语', value: 'fil' },
    { name: '加利西亚语', value: 'glg' },
    { name: '格鲁吉亚语', value: 'geo' },
    { name: '古吉拉特语', value: 'guj' },
    { name: '豪萨语', value: 'hau' },
    { name: '希伯来语', value: 'heb' },
    { name: '印地语', value: 'hi' },
    { name: '冰岛语', value: 'ice' },
    { name: '伊博语', value: 'ibo' },
    { name: '印尼语', value: 'id' },
    { name: '爱尔兰语', value: 'gle' },
    { name: '卡纳达语', value: 'kan' },
    { name: '克林贡语', value: 'kli' },
    { name: '库尔德语', value: 'kur' },
    { name: '老挝语', value: 'lao' },
    { name: '拉丁语', value: 'lat' },
    { name: '拉脱维亚语', value: 'lav' },
    { name: '立陶宛语', value: 'lit' },
    { name: '卢森堡语', value: 'ltz' },
    { name: '马其顿语', value: 'mac' },
    { name: '马拉加斯语', value: 'mg' },
    { name: '马来语', value: 'may' },
    { name: '马拉雅拉姆语', value: 'mal' },
    { name: '马耳他语', value: 'mlt' },
    { name: '马拉地语', value: 'mar' },
    { name: '尼泊尔语', value: 'nep' },
    { name: '新挪威语', value: 'nno' },
    { name: '波斯语', value: 'per' },
    { name: '萨丁尼亚语', value: 'srd' },
    { name: '塞尔维亚语(拉丁文)', value: 'srp' },
    { name: '僧伽罗语 ', value: 'sin' },
    { name: '斯洛伐克语', value: 'sk' },
    { name: '索马里语', value: 'som' },
    { name: '斯瓦希里语', value: 'swa' },
    { name: '他加禄语', value: 'tgl' },
    { name: '塔吉克语', value: 'tgk' },
    { name: '泰米尔语', value: 'tam' },
    { name: '鞑靼语', value: 'tat' },
    { name: '泰卢固语', value: 'tel' },
    { name: '土耳其语', value: 'tr' },
    { name: '土库曼语', value: 'tuk' },
    { name: '乌克兰语', value: 'ukr' },
    { name: '乌尔都语', value: 'urd' },
    { name: '奥克语', value: 'oci' },
    { name: '吉尔吉斯语', value: 'kir' },
    { name: '普什图语', value: 'pus' },
    { name: '高棉语', value: 'hkm' },
    { name: '海地语', value: 'ht' },
    { name: '书面挪威语', value: 'nob' },
    { name: '旁遮普语', value: 'pan' },
    { name: '阿尔及利亚阿拉伯语', value: 'arq' },
    { name: '比斯拉马语', value: 'bis' },
    { name: '加拿大法语', value: 'frn' },
    { name: '哈卡钦语', value: 'hak' },
    { name: '胡帕语', value: 'hup' },
    { name: '印古什语', value: 'ing' },
    { name: '拉特加莱语', value: 'lag' },
    { name: '毛里求斯克里奥尔语', value: 'mau' },
    { name: '黑山语', value: 'mot' },
    { name: '巴西葡萄牙语', value: 'pot' },
    { name: '卢森尼亚语', value: 'ruy' },
    { name: '塞尔维亚-克罗地亚语', value: 'sec' },
    { name: '西里西亚语', value: 'sil' },
    { name: '突尼斯阿拉伯语', value: 'tua' },
    { name: '亚齐语', value: 'ach' },
    { name: '阿肯语', value: 'aka' },
    { name: '阿拉贡语', value: 'arg' },
    { name: '艾马拉语', value: 'aym' },
    { name: '俾路支语', value: 'bal' },
    { name: '巴什基尔语', value: 'bak' },
    { name: '本巴语', value: 'bem' },
    { name: '柏柏尔语', value: 'ber' },
    { name: '博杰普尔语', value: 'bho' },
    { name: '比林语', value: 'bli' },
    { name: '布列塔尼语', value: 'bre' },
    { name: '切罗基语', value: 'chr' },
    { name: '齐切瓦语', value: 'nya' },
    { name: '楚瓦什语', value: 'chv' },
    { name: '康瓦尔语', value: 'cor' },
    { name: '科西嘉语', value: 'cos' },
    { name: '克里克语', value: 'cre' },
    { name: '克里米亚鞑靼语', value: 'cri' },
    { name: '迪维希语', value: 'div' },
    { name: '古英语', value: 'eno' },
    { name: '中古法语', value: 'frm' },
    { name: '弗留利语', value: 'fri' },
    { name: '富拉尼语', value: 'ful' },
    { name: '盖尔语', value: 'gla' },
    { name: '卢干达语', value: 'lug' },
    { name: '古希腊语', value: 'gra' },
    { name: '瓜拉尼语', value: 'grn' },
    { name: '夏威夷语', value: 'haw' },
    { name: '希利盖农语', value: 'hil' },
    { name: '伊多语', value: 'ido' },
    { name: '因特语', value: 'ina' },
    { name: '伊努克提图特语', value: 'iku' },
    { name: '爪哇语', value: 'jav' },
    { name: '卡拜尔语', value: 'kab' },
    { name: '格陵兰语', value: 'kal' },
    { name: '卡努里语', value: 'kau' },
    { name: '克什米尔语', value: 'kas' },
    { name: '卡舒比语', value: 'kah' },
    { name: '卢旺达语', value: 'kin' },
    { name: '刚果语', value: 'kon' },
    { name: '孔卡尼语', value: 'kok' },
    { name: '林堡语', value: 'lim' },
    { name: '林加拉语', value: 'lin' },
    { name: '逻辑语', value: 'loj' },
    { name: '低地德语', value: 'log' },
    { name: '下索布语', value: 'los' },
    { name: '迈蒂利语', value: 'mai' },
    { name: '曼克斯语', value: 'glv' },
    { name: '毛利语', value: 'mao' },
    { name: '马绍尔语', value: 'mah' },
    { name: '南恩德贝莱语', value: 'nbl' },
    { name: '那不勒斯语', value: 'nea' },
    { name: '西非书面语', value: 'nqo' },
    { name: '北方萨米语', value: 'sme' },
    { name: '挪威语', value: 'nor' },
    { name: '奥杰布瓦语', value: 'oji' },
    { name: '奥里亚语', value: 'ori' },
    { name: '奥罗莫语', value: 'orm' },
    { name: '奥塞梯语', value: 'oss' },
    { name: '邦板牙语', value: 'pam' },
    { name: '帕皮阿门托语', value: 'pap' },
    { name: '北索托语', value: 'ped' },
    { name: '克丘亚语', value: 'que' },
    { name: '罗曼什语', value: 'roh' },
    { name: '罗姆语', value: 'ro' },
    { name: '萨摩亚语', value: 'sm' },
    { name: '梵语', value: 'san' },
    { name: '苏格兰语', value: 'sco' },
    { name: '掸语', value: 'sha' },
    { name: '修纳语', value: 'sna' },
    { name: '信德语', value: 'snd' },
    { name: '桑海语', value: 'sol' },
    { name: '南索托语', value: 'sot' },
    { name: '叙利亚语', value: 'syr' },
    { name: '德顿语', value: 'tet' },
    { name: '提格利尼亚语', value: 'tir' },
    { name: '聪加语', value: 'tso' },
    { name: '契维语', value: 'twi' },
    { name: '高地索布语', value: 'ups' },
    { name: '文达语', value: 'ven' },
    { name: '瓦隆语', value: 'wln' },
    { name: '威尔士语', value: 'wel' },
    { name: '西弗里斯语', value: 'fry' },
    { name: '沃洛夫语', value: 'wol' },
    { name: '科萨语', value: 'xho' },
    { name: '意第绪语', value: 'yid' },
    { name: '约鲁巴语', value: 'yor' },
    { name: '扎扎其语', value: 'zaz' },
    { name: '祖鲁语', value: 'zul' },
    { name: '巽他语', value: 'sun' },
    { name: '苗语', value: 'hmn' },
    { name: '塞尔维亚语(西里尔文)', value: 'src' },
  ]
}
