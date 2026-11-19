@echo off
rem The PromptedCRE command line, from any folder:  pcre <group> <verb> [arguments] [--flags]
node "%~dp0node_modules\tsx\dist\cli.mjs" "%~dp0cli\pcre.ts" %*
