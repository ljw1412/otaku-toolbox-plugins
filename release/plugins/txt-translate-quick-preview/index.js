;(function () {
  const { Vue, appUse, appMount, electron } = window.usePlugin()
  const { createApp, defineComponent, ref, reactive } = Vue
  const baiduLanguageList = getBaiduLanguageList()
  window.debugTxtTranslate = ref(false)

  const engines = ['youdao', 'baidu']

  const app = createApp({
    name: 'TxtTranslate',

    compilerOptions: {
      isCustomElement: (tag) => ['webview'].includes(tag),
    },

    template: `<div class="txt-translate-quick-preview d-flex">
  <div class="w-50 pl-8 pr-4 flex-shrink-0">
    <div class="o-header layout-lr">
      <span>原文</span>
      <div class="layout-lr">
        <span v-show="translating" class="mr-8 fz-12">{{translateIndex}} / {{splitSize}}</span>
        <a-button size="small" :loading="translating" @click="translate">翻译</a-button>
      </div>
    </div>
    <a-textarea v-model="text" style="height: calc(100% - 50px)"></a-textarea>
  </div>
  <a-tabs v-model:active-key="who" class="w-50 pl-4 pr-8 flex-shrink-0">
    <a-tab-pane key="youdao" title="有道翻译">
      <div class="translate-result" :style="{fontSize: resultFontsize + 'px'}">{{youdao.result.join('\\n')}}</div>
      <webview v-show="debugTxtTranslate"
        ref="youdaoView" 
        src="https://fanyi.youdao.com/" 
        @dom-ready="handleYouDaoDomReady" />
    </a-tab-pane>
    <a-tab-pane key="baidu" title="百度翻译">
      <div class="translate-result" :style="{fontSize: resultFontsize + 'px'}">{{baidu.result.join('\\n')}}</div>
      <webview v-show="debugTxtTranslate"
        ref="baiduView"
        src="https://fanyi.baidu.com/#jp/zh/"  
        @dom-ready="handleBaiduDomReady" />
    </a-tab-pane>
    <div class="setting-fontsize">
      <div class="fs-item" v-for="size of [14,16,18,20]" :class="['fs-'+size,{active: size === resultFontsize}]" @click="resultFontsize = size">A</div>
    </div>
    <template #extra>
      <div v-show="who === 'youdao'">
        <a-select v-model="youdao.language"
          allow-search
          size="mini" 
          @change="handleYouDaoLanguageChange">
          <a-option v-for="item of youdao.languageList"
            :key="item.value" :label="item.name" :value="item.value">
          </a-option>
        </a-select>
      </div>
      <div v-show="who === 'baidu'">
        <a-select v-model="baidu.language"
          allow-search
          size="mini" 
          style="width: 160px;"
          @change="handleBaiduLanguageChange('from',$event)">
          <a-option v-for="item of baidu.languageList"
            :disabled="item.value === baidu.targetLanguage"
            :key="item.value" :label="item.name" :value="item.value">
          </a-option>
        </a-select>
        <icon-double-right class="mx-8"/>
        <a-select v-model="baidu.targetLanguage"
          allow-search
          size="mini" 
          style="width: 160px;"
          @change="handleBaiduLanguageChange('to',$event)">
          <a-option v-for="item of baidu.targetLanguageList"
            :disabled="item.value === baidu.language"
            :key="item.value" :label="item.name" :value="item.value">
          </a-option>
        </a-select>
      </div>
    </template>
  </a-tabs>
</div>`,

    components: {},

    setup() {
      const youdaoView = ref()
      const baiduView = ref()
      return { youdaoView, baiduView }
    },

    data() {
      return {
        text: '',
        who: 'youdao',
        translating: false,
        translateIndex: 1,
        splitSize: 1,
        resultFontsize: 16,
        youdao: {
          loaded: false,
          result: [],
          languageList: [],
          language: '',
        },
        baidu: {
          loaded: false,
          result: [],
          languageList: baiduLanguageList,
          language: '',
          targetLanguageList: baiduLanguageList.slice(1),
          targetLanguage: '',
        },
      }
    },

    computed: {
      debugTxtTranslate() {
        return window.debugTxtTranslate.value
      },
    },

    mounted() {},

    methods: {
      async handleYouDaoDomReady() {
        const { languageList, language } =
          await this.youdaoView.executeJavaScript(
            `var selected = document.querySelector('#languageSelect li.selected');
          ({
            language: selected ? (selected.dataset.value || 'AUTO') : 'AUTO',
            languageList: Array.from(document.querySelectorAll('#languageSelect li')).map(el=>{return {name:el.textContent, value: el.dataset.value}})
          })`
          )
        this.youdao.languageList = languageList
        this.youdao.language = language
        this.youdao.loaded = true
        console.log('YouDao is Ready')
        // this.youdao.openDevTools()
      },

      async handleBaiduDomReady() {
        const { language, targetLanguage } = await this.baiduView
          .executeJavaScript(`
        var form = document.querySelector('.select-from-language .language-selected'); 
        var to = document.querySelector('.select-to-language .language-selected');
        ({
          language: form ? form.dataset.lang : '',
            targetLanguage: to ? to.dataset.lang : ''
          })
          `)

        this.baidu.language = language
        this.baidu.targetLanguage = targetLanguage
        this.baidu.loaded = true
        console.log('Baidu is Ready')
        // this.baidu.openDevTools()
      },

      async handleYouDaoLanguageChange(lang) {
        console.log('[有道切换语言]', lang)
        await this.youdaoView.executeJavaScript(
          `var langEl = document.querySelector("[data-value='${lang}'] a");
          langEl && (langEl.click());`
        )
        setTimeout(this.getTransTargetYoudao, 1000)
      },

      async handleBaiduLanguageChange(who, lang) {
        const item = this.baidu.languageList.find((item) => item.value === lang)
        console.log('[百度切换语言]', who, lang, item)
        const selectName = `.select-${who}-language`
        await this.baiduView.executeJavaScript(
          `var selectEl = document.querySelector("${selectName}");
          console.log(selectEl);
          selectEl && (selectEl.click());
          setTimeout(()=>{
            var langItem = Array.from(document.querySelectorAll(".lang-panel .lang-item")).find(el=>el.innerHTML === '${item.name}');
            console.log(langItem);
            langItem && (langItem.click());
          },300);`
        )
        setTimeout(this.getTransTargetBaidu, 1300)
      },

      async translate() {
        if (!this.text.trim()) return
        this.youdao.result = []
        this.baidu.result = []
        this.translating = true
        const textList = this.safeTextList()
        this.splitSize = textList.length
        this.translateTask(textList, 0)
      },

      safeTextList() {
        const maxLength = 4800
        const spList = this.text.split('\n')
        const list = []
        let subText = ''
        spList.forEach((item) => {
          if (item.length > maxLength) {
            list.push(item)
            return
          }
          if (subText.length + item.length > maxLength) {
            list.push(subText)
            subText = item + '\n'
            return
          }
          subText += item + '\n'
        })
        if (subText) list.push(subText)
        return list
      },

      async translateTask(textList, i) {
        if (i < textList.length) {
          this.translateIndex = i + 1
          text = textList[i]
          this.translateYoudao(text)
          this.translateBaidu(text)
          setTimeout(() => {
            this.translateTask(textList, i + 1)
          }, 5000)
        } else {
          this.translating = false
          console.log(this.youdao.result)
        }
      },

      async translateYoudao(text) {
        if (!this.youdao.loaded) return
        await this.youdaoView.executeJavaScript(
          `var input = document.querySelector('#inputOriginal');
            var btn = document.querySelector('#transMachine');
          if(input && btn){
            input.value = \`${text}\`;
            btn.click();
          }`
        )
        setTimeout(this.getTransTargetYoudao, 1000)
      },

      async translateBaidu(text) {
        if (!this.baidu.loaded) return
        await this.baiduView.executeJavaScript(
          `var input = document.querySelector('#baidu_translate_input');
          var btn = document.querySelector('#translate-button');
        if(input && btn){
          input.value =  \`${text}\`;
          btn.click();
        }`
        )
        setTimeout(this.getTransTargetBaidu, 1000)
      },

      async getTransTargetYoudao() {
        if (!this.youdao.loaded) return
        const result = await this.youdaoView.executeJavaScript(
          `Array.from(document.querySelectorAll('#transTarget p')).map(item=>item.innerText==='\\n'?'':item.innerText).join('\\n')`
        )
        this.youdao.result.push(result)
      },

      async getTransTargetBaidu() {
        if (!this.baidu.loaded) return
        const result = await this.baiduView.executeJavaScript(
          `Array.from(document.querySelectorAll('.trans-right .target-output')).map(item=>item.innerText).join('\\n')`
        )
        this.baidu.result.push(result)
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
