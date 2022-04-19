const { glob } = require('glob')
const { join } = require('path')
const fs = require('fs')
const only = require('only')

const DEV_DIR = join(__dirname, '..', 'dev')
const PLUGINS_DIR = join(DEV_DIR, 'plugins')

const acgNames = ['anime', 'comic', 'game']

function createACGItemRuleList(type) {
  const ACG_DIR = join(DEV_DIR, type)
  const files = glob.sync(`${ACG_DIR}/!(list).json`)
  fs.mkdirSync(ACG_DIR, { recursive: true })
  const list = files.map((file) => {
    const config = require(file)
    return only(config, 'name namespace icon url type version')
  })
  console.log(list)
  fs.writeFileSync(join(ACG_DIR, 'list.json'), JSON.stringify(list))
}

module.exports = {
  createPluginList() {
    const files = glob.sync(`${PLUGINS_DIR}/**/config.json`)
    console.log(files)
    const list = files.map((file) => {
      const config = require(file)
      return only(config, 'plugin icon name desc version config css')
    })
    fs.writeFileSync(
      join(PLUGINS_DIR, 'list.json'),
      JSON.stringify(list, null, 2)
    )
  },
  createACGRuleList() {
    acgNames.forEach((name) => {
      createACGItemRuleList(name)
    })
  },
}
