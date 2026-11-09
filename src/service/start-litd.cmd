@echo off
setlocal
set "NODE=%DSH_NODE%"
if not defined NODE (
  for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE set "NODE=%%I"
)
if not defined NODE (
  echo Node.js not found.
  echo Set DSH_NODE to the bundled node.exe path, or add node to PATH.
  exit /b 1
)
"%NODE%" "%~dp0litd.mjs"
