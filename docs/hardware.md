# Hardware notes

## DB01 board (from `DB01.kicad_sch`, Rev A, 2026-04-02)

| Ref     | Part                | Notes                                          |
|---------|---------------------|------------------------------------------------|
| U1      | MDS_DB01p           | DB01 processor. Exposes ADC mux inputs (`adc_in_*`), JTAG7, UART (`i_uart*_SIO_*`), I²C (`i_i2c_clk/data_in`), SAI/SSI (`i_ssi_*`), 1PPS. Powered at 1.8 V / 0.9 V rails. |
| U6, U7  | IMP34DT05           | PDM MEMS microphones. `CLKK`, `DOUT`, L/R select. |
| U5      | AT25QL321-MBUE-T    | 32-Mbit QSPI NOR flash (model + config storage). |
| U8      | ECS-2018-240-BN-TR3 | 24 MHz oscillator → `REF_CLK`.                  |
| J1      | CONN10_734-270_WAG  | 10-pin JTAG (`JTAG7_*`) + UART debug header.    |
| SW2, R5 | —                   | Reset / boot-mode strap on `HARD_RESET`.        |

## Adding the nRF5340

The nRF5340 is the BLE + DSP host added to this design. It must reach:

- **Microphones** — either the DB01's PDM mics (`CLKK`/`DOUT`) or a separate
  INMP441 on I2S. Wire the chosen interface to nRF5340 GPIOs and update
  `boards/nrf5340dk_nrf5340_cpuapp.overlay`.
- **DB01 processor** — cleaned audio out over the DB01 **SAI/SSI** port
  (`i_ssi_sclk_*`, `i_ssi_txd`, `i_ssi_rxd`, `i_ssi_ss_*`). This is the
  `TODO(hw)` output link in `main.c`.
- **Debug** — SWD/JTAG and a UART console.

## Creating a real board definition

The scaffold builds against `nrf5340dk/nrf5340/cpuapp` so it compiles on a
stock NCS install. For production hardware:

1. Add `boards/<vendor>/db01_nrf5340/` with `.dts`, `_defconfig`, and
   `board.yml` per the Zephyr [board porting guide](https://docs.zephyrproject.org/latest/hardware/porting/board_porting.html).
2. Move the pin map from the DK overlay into the board `.dts`.
3. Build with `-b db01_nrf5340/nrf5340/cpuapp --sysbuild`.

## Pin map — TODO

The overlay pins are **placeholders**. Fill in from the DB01 net list:

| Signal        | nRF5340 pin | Source                    |
|---------------|-------------|---------------------------|
| PDM CLK       | `P0.26` ?   | mic `CLKK`   — confirm     |
| PDM DIN       | `P0.25` ?   | mic `DOUT`   — confirm     |
| I2S SCK/WS/SD | `P0.26/27/25` ? | INMP441 — confirm     |
| SAI → DB01    | TBD         | DB01 `i_ssi_*` — confirm   |
