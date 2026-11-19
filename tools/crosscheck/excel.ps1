# Cross-checks the worked examples in Excel. Windows only; run when Excel is
# NOT already open (it starts its own hidden instance and never saves).
#   powershell -File tools/crosscheck/excel.ps1 -Examples examples.json -Out excel.json
param(
  [Parameter(Mandatory = $true)][string]$Examples,
  [Parameter(Mandatory = $true)][string]$Out
)
$ErrorActionPreference = "Stop"
if (Get-Process -Name EXCEL -ErrorAction SilentlyContinue) { throw "Excel is open; close it first." }

$ex = Get-Content $Examples -Raw | ConvertFrom-Json
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$pidList = (Get-Process -Name EXCEL).Id
try {
  $wb = $excel.Workbooks.Add()
  $ws = $wb.Worksheets.Item(1)
  $row = 1
  $results = [ordered]@{}
  function Calc([string]$name, [string]$formula) {
    $cell = $ws.Cells.Item($script:row, 1)
    $cell.Formula = $formula
    $script:results[$name] = $cell.Value2
    $script:row++
  }
  function Vec([double[]]$values) {
    $start = $script:row
    foreach ($v in $values) { $ws.Cells.Item($script:row, 2).Value2 = $v; $script:row++ }
    return "B$($start):B$($script:row - 1)"
  }

  # Excel's own functions on plain inputs
  Calc "fn.pmt" "=PMT(0.005,360,1000000)"
  Calc "fn.ipmt1" "=IPMT(0.005,1,360,1000000)"
  Calc "fn.ipmt120" "=IPMT(0.005,120,360,1000000)"
  Calc "fn.ppmt120" "=PPMT(0.005,120,360,1000000)"
  Calc "fn.fv60" "=FV(0.005,60,-5995.51,1000000)"
  Calc "fn.pv" "=PV(0.005,360,-5000)"
  $dates = $ex.dated | ForEach-Object { $_.date }
  $amts = $ex.dated | ForEach-Object { [double]$_.amount }
  $s = $row
  for ($i = 0; $i -lt $amts.Count; $i++) {
    $p = $dates[$i].Split("-")
    $ws.Cells.Item($row, 3).Formula = "=DATE($([int]$p[0]),$([int]$p[1]),$([int]$p[2]))"
    $ws.Cells.Item($row, 4).Value2 = $amts[$i]
    $row++
  }
  Calc "fn.xirr" "=XIRR(D$($s):D$($row - 1),C$($s):C$($row - 1))"

  # Debt sizing example: NOI 500,000; value 8,000,000; 6.5%; 30-yr amortization; 10-yr term; 2 yrs IO
  Calc "debt.loanByDscr" "=PV(0.065/12,360,-(500000/1.25)/12)"
  Calc "debt.loan" "=MIN(PV(0.065/12,360,-(500000/1.25)/12),8000000*0.7,500000/0.08)"
  Calc "debt.ioPayment" "=PV(0.065/12,360,-(500000/1.25)/12)*0.065/12"
  Calc "debt.amortPayment" "=PMT(0.065/12,360,-PV(0.065/12,360,-(500000/1.25)/12))"
  Calc "debt.balloon" "=-FV(0.065/12,96,-PMT(0.065/12,360,-PV(0.065/12,360,-(500000/1.25)/12)),PV(0.065/12,360,-(500000/1.25)/12))"
  Calc "debt.year1Interest" "=PV(0.065/12,360,-(500000/1.25)/12)*0.065"
  Calc "debt.year3Interest" "=-CUMIPMT(0.065/12,360,PV(0.065/12,360,-(500000/1.25)/12),1,12,0)"
  Calc "debt.year3Principal" "=-CUMPRINC(0.065/12,360,PV(0.065/12,360,-(500000/1.25)/12),1,12,0)"
  Calc "debt.dscr" "=500000/(12*PMT(0.065/12,360,-PV(0.065/12,360,-(500000/1.25)/12)))"

  # Returns example, built from scratch with Excel formulas
  function ReturnsIrr([double]$cap, [double]$g, [string]$prefix) {
    $noi = @(); for ($t = 1; $t -le 6; $t++) { $noi += 600000 * [math]::Pow(1 + $g, $t - 1) }
    $ws.Cells.Item($script:row, 5).Formula = "=12*PMT(0.065/12,360,-6000000)"; $ds = $ws.Cells.Item($script:row, 5).Value2; $script:row++
    $ws.Cells.Item($script:row, 5).Formula = "=-FV(0.065/12,60,-PMT(0.065/12,360,-6000000),6000000)"; $bal = $ws.Cells.Item($script:row, 5).Value2; $script:row++
    $net = ($noi[5] / $cap) * 0.98
    $unlev = @(-10200000.0); $lev = @(-4200000.0)
    for ($t = 1; $t -le 5; $t++) {
      $u = $noi[$t - 1]; $l = $noi[$t - 1] - $ds
      if ($t -eq 5) { $u += $net; $l += $net - $bal }
      $unlev += $u; $lev += $l
    }
    $ur = Vec $unlev; $lr = Vec $lev
    Calc "$prefix.unleveredIrr" "=IRR($ur)"
    Calc "$prefix.leveredIrr" "=IRR($lr)"
  }
  ReturnsIrr 0.065 0.03 "returns"
  ReturnsIrr 0.06 0.04 "returns.corner1"
  ReturnsIrr 0.07 0.02 "returns.corner2"

  # Waterfall: the investor class should reach exactly 8% through tier 1 and 12% through tier 2
  $r1 = Vec ([double[]]$ex.waterfall.throughTier1); Calc "waterfall.irrThroughTier1" "=IRR($r1)"
  $r2 = Vec ([double[]]$ex.waterfall.throughTier2); Calc "waterfall.irrThroughTier2" "=IRR($r2)"
  $r3 = Vec ([double[]]$ex.waterfall.investorFlows); Calc "waterfall.investorIrr" "=IRR($r3)"

  $results["excelVersion"] = $excel.Version
  $results | ConvertTo-Json | Set-Content -Path $Out -Encoding utf8
  $wb.Close($false)
}
finally {
  $excel.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
  # stop only the Excel process this script started, if it lingers
  Get-Process -Name EXCEL -ErrorAction SilentlyContinue | Where-Object { $pidList -contains $_.Id } | Stop-Process -Force -ErrorAction SilentlyContinue
}
