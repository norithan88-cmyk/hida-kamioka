# 神岡町のイベント 自動更新

飛騨市公式サイトのイベントRSSから、タイトルまたは本文に「神岡」を含み、
終了日が過ぎていないものだけを抽出して`events.json`に保存する。

- 更新：毎日1回（GitHub Actions）
- 情報源：https://www.city.hida.gifu.jp/rss/10/list5.xml
- 終了済みイベント：次回更新時に自動除外
