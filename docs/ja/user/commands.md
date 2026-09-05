# コマンド

知りたいことに対して最も狭いコマンドを使います。正確な option と終了条件は
`docbridge <command> --help` で確認できます。

## check: プロジェクトを検証する

```sh
docbridge check
```

設定、アノテーション、target、双方向性を検証します。`--audit` は未文書化の宣言と
未リンクの Markdown section を warning として追加し、`--json` は機械可読な結果を
返します。error があれば終了コード `1`、warning のみなら `0` です。

## related: カウンターパートを探す

```sh
git diff --name-only | docbridge related --stdin
```

変更ファイルにリンクされた相手を列挙します。`--gate` は変更セットに含まれない相手が
あれば `1` になりますが、更新が必要かどうかは判断しません。

## context: カウンターパートを読む

```sh
docbridge context src/auth.ts
```

リンクされた Markdown section またはコード宣言を出力します。通常出力は agent prompt
向け、`--json` は構造化された context、diagnostic、summary 向けです。

## graph: リンク構造を調べる

```sh
docbridge graph --json --include-content
```

endpoint、edge、双方向 pair、未解決リンクを表示します。path を渡すと、そのファイルと
直接のカウンターパートに絞れます。`--include-content` は `--json` と併用します。

## docs: 同梱ガイドを読む

`docbridge docs list` は CLI と同じ version のガイドを一覧し、
`docbridge docs show <name>` は1件を出力します。canonical 名は
`getting-started`、`configuration`、`linking`、`commands`、`automation`、
`troubleshooting` です。

別 directory を project root にする場合は project command に `--root <path>` を
指定します。リンク作成は [リンク](linking.md)、自動化は [自動化](automation.md)、
失敗時は [トラブルシューティング](troubleshooting.md) を参照してください。
