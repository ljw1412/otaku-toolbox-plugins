const router = require('koa-router')()
const { createPluginList, createACGRuleList } = require('../utils/build-dev')

router.get('/', async (ctx, next) => {
  ctx.body = 'Hello otaku-toolbox-plugins!'
})

router.get('/create-list', async (ctx, next) => {
  createPluginList()
  createACGRuleList()
  ctx.body = { message: '生成列表成功！' }
})

module.exports = router
