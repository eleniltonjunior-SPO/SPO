#!/usr/bin/env python3
"""SPO Bot V5 - sinais de swing trade (D1 + 4h) para spot Binance via ccxt."""

import json
import logging
import os
import sys
import tempfile
import time
import traceback
from dataclasses import dataclass, field
from datetime import datetime, timezone

import ccxt
import pandas as pd
import requests

CFG = {
    "EXCHANGE_ID": "binance",
    "SYMBOLS": [
        "BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT",
        "ADA/USDT", "AVAX/USDT", "LINK/USDT", "DOGE/USDT", "TON/USDT",
    ],
    "TIMEFRAME_D1": "1d",
    "TIMEFRAME_H4": "4h",
    "CANDLES_D1": 400,
    "CANDLES_H4": 400,
    "LOOP_INTERVAL_SEC": 900,
    "PIVOT_N": 3,
    "ATR_PERIOD": 14,
    "EMA_FAST": 50,
    "EMA_SLOW": 200,
    "FIB_038": 0.382,
    "FIB_050": 0.5,
    "FIB_061": 0.618,
    "SETUP_A_MIN_LEG_ATR_MULT": 4.0,
    "SETUP_A_STOP_ATR_MULT": 0.25,
    "SETUP_A_ALVO1_ATR_MULT": 0.25,
    "SETUP_A_ALVO2_ATR_MULT": 0.5,
    "SETUP_A_ALVO3_LEG_MULT": 1.5,
    "SETUP_A_LEG_LOOKBACK": 90,
    "SETUP_B_CONTEXT_EMA_SLOPE_DAYS": 5,
    "SETUP_B_PIVOT_LOOKBACK": 60,
    "SETUP_B_BREAKOUT_MAX_DAYS": 20,
    "SETUP_B_INVALIDATION_ATR_MULT": 1.0,
    "SETUP_B_RETEST_ZONE_ATR_MULT": 0.5,
    "SETUP_B_STOP_ATR_MULT": 0.25,
    "SETUP_B_TARGET_MIN_ATR_SEP_MULT": 0.5,
    "SETUP_B_TARGET_RR": [2.0, 3.5, 5.0],
    "MIN_RR_ALVO2": 2.0,
    "VOLUME_ALERT_LOOKBACK": 20,
    "VOLUME_ALERT_MULT": 1.2,
    "SHORT_EMA200_SLOPE_DAYS": 10,
    "ESTADO_PATH": "/root/estado_v5.json",
    "RESULTADOS_PATH": "/root/resultados_v5.json",
    "TELEGRAM_CHAT_ID": "-1003796708851",
    "TELEGRAM_TOKEN_ENV": "TELEGRAM_TOKEN",
    "MODO_SOMBRA_ENV": "MODO_SOMBRA",
    "MODO_SOMBRA_DEFAULT": True,
    "MAX_RETRIES": 3,
    "RETRY_BACKOFF_BASE": 2,
    "PARCIAL_1_PCT": 40,
    "PARCIAL_2_PCT": 40,
    "RESTANTE_PCT": 20,
}


# --------------------------------------------------------------------------
# Infra: exchange, retry, estado, resultados, telegram
# --------------------------------------------------------------------------

def com_retry(fn, *args, tentativas=None, **kwargs):
    tentativas = tentativas or CFG["MAX_RETRIES"]
    ultimo_erro = None
    for i in range(tentativas):
        try:
            return fn(*args, **kwargs)
        except Exception as e:
            ultimo_erro = e
            logging.warning(f"tentativa {i + 1}/{tentativas} falhou: {e}")
            if i < tentativas - 1:
                time.sleep(CFG["RETRY_BACKOFF_BASE"] ** i)
    raise ultimo_erro


def build_exchange():
    klass = getattr(ccxt, CFG["EXCHANGE_ID"])
    return klass({"enableRateLimit": True})


def fetch_ohlcv_df(exchange, symbol, timeframe, limit):
    def _fetch():
        raw = exchange.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)
        if not raw:
            raise ValueError(f"OHLCV vazio para {symbol} {timeframe}")
        df = pd.DataFrame(raw, columns=["ts", "open", "high", "low", "close", "volume"])
        df["ts"] = pd.to_datetime(df["ts"], unit="ms", utc=True)
        df.set_index("ts", inplace=True)
        return df

    return com_retry(_fetch)


def _atomic_write_json(path, data):
    diretorio = os.path.dirname(path) or "."
    os.makedirs(diretorio, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=diretorio)
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(data, f, indent=2, default=str)
        os.replace(tmp_path, path)
    except Exception:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise


def load_estado():
    path = CFG["ESTADO_PATH"]
    if not os.path.exists(path):
        return {"posicoes": {}, "ultimo_4h_fechado": {}}
    try:
        with open(path) as f:
            estado = json.load(f)
    except Exception as e:
        logging.error(f"falha ao ler estado, iniciando vazio: {e}")
        return {"posicoes": {}, "ultimo_4h_fechado": {}}
    estado.setdefault("posicoes", {})
    estado.setdefault("ultimo_4h_fechado", {})
    return estado


def save_estado(estado):
    _atomic_write_json(CFG["ESTADO_PATH"], estado)


def load_resultados():
    path = CFG["RESULTADOS_PATH"]
    if not os.path.exists(path):
        return []
    try:
        with open(path) as f:
            return json.load(f)
    except Exception as e:
        logging.error(f"falha ao ler resultados: {e}")
        return []


def save_resultados(resultados):
    _atomic_write_json(CFG["RESULTADOS_PATH"], resultados)


def enviar_telegram(msg, modo_sombra):
    token = os.environ.get(CFG["TELEGRAM_TOKEN_ENV"])
    texto = f"[SOMBRA] {msg}" if modo_sombra else msg
    if not token:
        logging.error("TELEGRAM_TOKEN não definido, mensagem não enviada:")
        logging.info(texto)
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {"chat_id": CFG["TELEGRAM_CHAT_ID"], "text": texto}
    for tentativa in range(CFG["MAX_RETRIES"]):
        try:
            resp = requests.post(url, json=payload, timeout=10)
            if resp.status_code == 200:
                return
            logging.warning(f"telegram respondeu {resp.status_code}: {resp.text}")
        except Exception as e:
            logging.warning(f"falha ao enviar telegram (tentativa {tentativa + 1}): {e}")
        time.sleep(CFG["RETRY_BACKOFF_BASE"] ** tentativa)
    logging.error("falha definitiva ao enviar mensagem ao telegram")


# --------------------------------------------------------------------------
# Indicadores
# --------------------------------------------------------------------------

def true_range(df):
    prev_close = df["close"].shift(1)
    tr1 = df["high"] - df["low"]
    tr2 = (df["high"] - prev_close).abs()
    tr3 = (df["low"] - prev_close).abs()
    return pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)


def atr(df, n=None):
    n = n or CFG["ATR_PERIOD"]
    return true_range(df).rolling(window=n, min_periods=n).mean()


def ema(series, n):
    return series.ewm(span=n, adjust=False).mean()


def pivots(df, n=None):
    n = n or CFG["PIVOT_N"]
    janela = 2 * n + 1
    max_movel = df["high"].rolling(window=janela, center=True, min_periods=janela).max()
    min_movel = df["low"].rolling(window=janela, center=True, min_periods=janela).min()
    pivo_alto = df["high"].where(df["high"] == max_movel)
    pivo_baixo = df["low"].where(df["low"] == min_movel)
    return pivo_alto, pivo_baixo


def mare_alta(d1):
    if len(d1) < CFG["EMA_SLOW"] + CFG["PIVOT_N"] * 2 + 5:
        return False
    ph, pl = pivots(d1)
    ph_vals = ph.dropna()
    pl_vals = pl.dropna()
    if len(ph_vals) < 2 or len(pl_vals) < 2:
        return False
    ema_fast = ema(d1["close"], CFG["EMA_FAST"])
    ema_slow = ema(d1["close"], CFG["EMA_SLOW"])
    topo_atual, topo_ant = ph_vals.iloc[-1], ph_vals.iloc[-2]
    fundo_atual, fundo_ant = pl_vals.iloc[-1], pl_vals.iloc[-2]
    return bool(
        topo_atual > topo_ant
        and fundo_atual > fundo_ant
        and ema_fast.iloc[-1] > ema_slow.iloc[-1]
        and d1["close"].iloc[-1] > ema_slow.iloc[-1]
    )


def mirror_df(df):
    m = pd.DataFrame(index=df.index)
    m["open"] = -df["open"]
    m["high"] = -df["low"]
    m["low"] = -df["high"]
    m["close"] = -df["close"]
    m["volume"] = df["volume"]
    return m


# --------------------------------------------------------------------------
# Sinal
# --------------------------------------------------------------------------

@dataclass
class Signal:
    symbol: str
    setup: str
    lado: str
    entrada: float
    stop: float
    alvos: list = field(default_factory=list)
    motivo: str = ""
    alertas: list = field(default_factory=list)
    rr: list = field(default_factory=list)
    estrutura_ref: float = 0.0


def mirror_signal(sig):
    return Signal(
        symbol=sig.symbol,
        setup=sig.setup,
        lado="SHORT",
        entrada=-sig.entrada,
        stop=-sig.stop,
        alvos=[-a for a in sig.alvos],
        motivo=sig.motivo,
        alertas=list(sig.alertas),
        rr=list(sig.rr),
        estrutura_ref=-sig.estrutura_ref,
    )


# --------------------------------------------------------------------------
# Setup A - pullback na perna
# --------------------------------------------------------------------------

def setup_a(symbol, d1, h4_closed):
    if not mare_alta(d1):
        return None
    ph, _ = pivots(d1)
    ph_vals = ph.dropna()
    if ph_vals.empty:
        return None
    topo_time = ph_vals.index[-1]
    topo = float(ph_vals.iloc[-1])
    pos = d1.index.get_loc(topo_time)
    lookback = CFG["SETUP_A_LEG_LOOKBACK"]
    janela = d1.iloc[max(0, pos - lookback + 1): pos + 1]
    fundo = float(janela["low"].min())
    perna = topo - fundo
    if perna <= 0:
        return None

    atr_d1 = atr(d1)
    if pd.isna(atr_d1.iloc[-1]):
        return None
    atr_d1_val = float(atr_d1.iloc[-1])
    if perna < CFG["SETUP_A_MIN_LEG_ATR_MULT"] * atr_d1_val:
        return None

    fib_038 = topo - CFG["FIB_038"] * perna
    fib_050 = topo - CFG["FIB_050"] * perna
    fib_061 = topo - CFG["FIB_061"] * perna

    topo_fim = topo_time + pd.Timedelta(days=1)
    candidatos = h4_closed[h4_closed.index >= topo_fim]
    if candidatos.empty:
        return None
    menor_low = float(candidatos["low"].min())
    if menor_low > fib_038 or menor_low < fib_061:
        return None

    idx_fundo_pullback = candidatos["low"].idxmin()
    fundo_pb_high = float(candidatos.loc[idx_fundo_pullback, "high"])

    if len(h4_closed) < 2:
        return None
    ultimo = h4_closed.iloc[-1]
    anterior = h4_closed.iloc[-2]
    if not (ultimo["close"] > fundo_pb_high and anterior["close"] <= fundo_pb_high):
        return None

    atr_h4 = atr(h4_closed)
    if pd.isna(atr_h4.iloc[-1]):
        return None
    atr_h4_val = float(atr_h4.iloc[-1])

    stop = min(fib_050, menor_low) - CFG["SETUP_A_STOP_ATR_MULT"] * atr_h4_val
    entrada = float(ultimo["close"])
    if stop >= entrada:
        return None

    a1 = topo - CFG["SETUP_A_ALVO1_ATR_MULT"] * atr_d1_val
    a2 = topo + CFG["SETUP_A_ALVO2_ATR_MULT"] * atr_d1_val
    a3 = fundo + CFG["SETUP_A_ALVO3_LEG_MULT"] * perna

    risco = entrada - stop
    rr = [(a1 - entrada) / risco, (a2 - entrada) / risco, (a3 - entrada) / risco]
    if rr[1] < CFG["MIN_RR_ALVO2"]:
        return None

    alertas = []
    lookback_vol = CFG["VOLUME_ALERT_LOOKBACK"]
    vol_anteriores = h4_closed["volume"].iloc[-(lookback_vol + 1):-1]
    if len(vol_anteriores) == lookback_vol and ultimo["volume"] < CFG["VOLUME_ALERT_MULT"] * vol_anteriores.mean():
        alertas.append("volume do candle de gatilho abaixo da média dos últimos 20")

    ph4, _ = pivots(h4_closed)
    ph4_vals = ph4.dropna()
    resistencias = ph4_vals[(ph4_vals > entrada) & (ph4_vals < a1)]
    if not resistencias.empty:
        alertas.append("pivô de resistência 4h entre entrada e alvo 1")

    motivo = (
        f"pullback entre fib {CFG['FIB_038']} e {CFG['FIB_061']} da perna, "
        f"rompimento do fundo do pullback em {fundo_pb_high:.6f}"
    )
    return Signal(
        symbol, "A", "LONG", float(entrada), float(stop),
        [float(a1), float(a2), float(a3)], motivo, alertas,
        [float(r) for r in rr], float(fundo),
    )


# --------------------------------------------------------------------------
# Setup B - rompimento + reteste
# --------------------------------------------------------------------------

def setup_b(symbol, d1, h4_closed):
    slope_days = CFG["SETUP_B_CONTEXT_EMA_SLOPE_DAYS"]
    if len(d1) < CFG["EMA_FAST"] + slope_days + 2:
        return None

    ema50 = ema(d1["close"], CFG["EMA_FAST"])
    if not (d1["close"].iloc[-1] > ema50.iloc[-1]):
        return None
    inclinacao = ema50.diff().iloc[-slope_days:]
    if not (inclinacao > 0).all():
        return None

    atr_d1 = atr(d1)
    if pd.isna(atr_d1.iloc[-1]):
        return None
    atr_d1_val = float(atr_d1.iloc[-1])

    ph, pl = pivots(d1)
    lookback = CFG["SETUP_B_PIVOT_LOOKBACK"]
    candidatos_pivo = ph.iloc[-lookback:].dropna().sort_index(ascending=False)
    if candidatos_pivo.empty:
        return None

    nivel = None
    t_piv = None
    t_break = None
    max_dias = CFG["SETUP_B_BREAKOUT_MAX_DAYS"]
    for t_piv_c, nivel_c in candidatos_pivo.items():
        janela_fim = t_piv_c + pd.Timedelta(days=max_dias)
        janela_rompimento = d1[(d1.index > t_piv_c) & (d1.index <= janela_fim)]
        rompimentos = janela_rompimento[janela_rompimento["close"] > nivel_c]
        if rompimentos.empty:
            continue
        t_break_c = rompimentos.index[0]
        desde_rompimento = d1[d1.index >= t_break_c]
        nivel_invalidacao = nivel_c - CFG["SETUP_B_INVALIDATION_ATR_MULT"] * atr_d1_val
        if (desde_rompimento["close"] < nivel_invalidacao).any():
            continue
        nivel, t_piv, t_break = float(nivel_c), t_piv_c, t_break_c
        break

    if nivel is None:
        return None

    atr_h4 = atr(h4_closed)
    if pd.isna(atr_h4.iloc[-1]):
        return None
    atr_h4_val = float(atr_h4.iloc[-1])

    zona = nivel + CFG["SETUP_B_RETEST_ZONE_ATR_MULT"] * atr_h4_val
    if len(h4_closed) < 2:
        return None

    candidatos_reteste = h4_closed.iloc[:-1]
    candidatos_reteste = candidatos_reteste[
        (candidatos_reteste.index > t_break) & (candidatos_reteste["low"] <= zona)
    ]
    if candidatos_reteste.empty:
        return None
    idx_reteste = candidatos_reteste.index[-1]
    reteste_high = float(candidatos_reteste.loc[idx_reteste, "high"])

    ultimo = h4_closed.iloc[-1]
    anterior = h4_closed.iloc[-2]
    limiar = max(reteste_high, zona)
    if not (ultimo["close"] > limiar and anterior["close"] <= limiar):
        return None

    desde_reteste = h4_closed[h4_closed.index >= idx_reteste]
    stop = min(
        nivel - CFG["SETUP_B_INVALIDATION_ATR_MULT"] * atr_d1_val,
        float(desde_reteste["low"].min()) - CFG["SETUP_B_STOP_ATR_MULT"] * atr_h4_val,
    )
    entrada = float(ultimo["close"])
    if stop >= entrada:
        return None

    min_sep = CFG["SETUP_B_TARGET_MIN_ATR_SEP_MULT"] * atr_d1_val
    ph_vals = ph.dropna()
    acima = ph_vals[ph_vals > entrada].sort_values()
    alvos = []
    for val in acima:
        if not alvos or (val - alvos[-1]) >= min_sep:
            alvos.append(float(val))
        if len(alvos) == 3:
            break

    risco = entrada - stop
    if len(alvos) < 2:
        alvos = [entrada + r * risco for r in CFG["SETUP_B_TARGET_RR"]]
    while len(alvos) < 3:
        incremento = min_sep if min_sep > 0 else abs(alvos[-1]) * 0.01
        alvos.append(alvos[-1] + incremento)
    alvos = alvos[:3]

    rr = [(a - entrada) / risco for a in alvos]
    if rr[1] < CFG["MIN_RR_ALVO2"]:
        return None

    alertas = []
    lookback_vol = CFG["VOLUME_ALERT_LOOKBACK"]
    vol_anteriores_d1 = d1["volume"].loc[:t_break].iloc[-(lookback_vol + 1):-1]
    vol_break = float(d1.loc[t_break, "volume"])
    if len(vol_anteriores_d1) == lookback_vol and vol_break < CFG["VOLUME_ALERT_MULT"] * vol_anteriores_d1.mean():
        alertas.append("volume do dia de rompimento abaixo da média dos últimos 20 dias")

    pl_vals = pl.dropna()
    anteriores_ao_pivo = pl_vals[pl_vals.index < t_piv]
    if not anteriores_ao_pivo.empty:
        estrutura_ref = float(anteriores_ao_pivo.iloc[-1])
    else:
        estrutura_ref = float(d1["low"].loc[:t_piv].min())

    motivo = f"rompimento do nível {nivel:.6f} confirmado com reteste em {reteste_high:.6f}"
    return Signal(
        symbol, "B", "LONG", float(entrada), float(stop),
        [float(a) for a in alvos], motivo, alertas,
        [float(r) for r in rr], float(estrutura_ref),
    )


# --------------------------------------------------------------------------
# Filtro de short
# --------------------------------------------------------------------------

def short_gating_ok(d1, btc_d1_closed):
    slope_days = CFG["SHORT_EMA200_SLOPE_DAYS"]
    if len(d1) < CFG["EMA_SLOW"] + slope_days + 1:
        return False
    ema200 = ema(d1["close"], CFG["EMA_SLOW"])
    if not (d1["close"].iloc[-1] < ema200.iloc[-1]):
        return False
    inclinacao = ema200.diff().iloc[-slope_days:]
    if not (inclinacao < 0).all():
        return False
    if btc_d1_closed is None or mare_alta(btc_d1_closed):
        return False
    return True


# --------------------------------------------------------------------------
# Mensagens
# --------------------------------------------------------------------------

def gerar_mensagem_entrada(sig, preco_atual):
    seta = "🟢 COMPRAR AGORA" if sig.lado == "LONG" else "🔴 VENDER AGORA"
    ativo = sig.symbol.replace("/USDT", "")
    alvos_str = " > ".join(f"{a:.6f}" for a in sig.alvos)
    rr_str = " / ".join(f"{r:.2f}R" for r in sig.rr)
    linhas = [
        "SPO V5",
        f"{seta} — {ativo} (swing)",
        "──────────",
        "📍 Entrada: a mercado",
        f"🛑 Stop: {sig.stop:.6f}",
        f"🎯 Alvos: {alvos_str}",
        f"💡 {sig.motivo}",
        f"💰 Preço agora: {preco_atual:.6f}",
        f"📊 R:R nos alvos: {rr_str}",
    ]
    if sig.alertas:
        linhas.append(f"⚠️ {'; '.join(sig.alertas)}")
    return "\n".join(linhas)


def msg_parcial(symbol, pct, preco, motivo):
    ativo = symbol.replace("/USDT", "")
    return f"SPO V5\n📦 Parcial {pct}% — {ativo} @ {preco:.6f} ({motivo})"


def msg_breakeven(symbol):
    ativo = symbol.replace("/USDT", "")
    return f"SPO V5\n⚖️ Stop movido para entrada (breakeven) — {ativo}"


def msg_stop(symbol, preco):
    ativo = symbol.replace("/USDT", "")
    return f"SPO V5\n🛑 Stop atingido — {ativo} @ {preco:.6f}. Posição encerrada."


def msg_estrutura(symbol, preco):
    ativo = symbol.replace("/USDT", "")
    return f"SPO V5\n📉 Perda de estrutura no D1 — {ativo} @ {preco:.6f}. Posição encerrada."


# --------------------------------------------------------------------------
# Abertura e gestão de posições
# --------------------------------------------------------------------------

def find_resultado(resultados, trade_id):
    for r in resultados:
        if r.get("trade_id") == trade_id:
            return r
    return None


def abrir_posicao(symbol, sig, preco_atual, estado, resultados, modo_sombra):
    agora = datetime.now(timezone.utc).isoformat()
    trade_id = f"{symbol.replace('/', '')}-{sig.setup}-{sig.lado}-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}"

    estado["posicoes"][symbol] = {
        "trade_id": trade_id,
        "setup": sig.setup,
        "lado": sig.lado,
        "entrada": sig.entrada,
        "stop_inicial": sig.stop,
        "stop_atual": sig.stop,
        "alvos": sig.alvos,
        "parciais": {"a1": False, "a2": False},
        "estrutura_ref": sig.estrutura_ref,
        "aberto_em": agora,
        "saidas": [],
    }

    resultados.append({
        "trade_id": trade_id,
        "ativo": symbol,
        "setup": sig.setup,
        "lado": sig.lado,
        "entrada": sig.entrada,
        "stop_inicial": sig.stop,
        "alvos": sig.alvos,
        "timestamps": {"aberto": agora, "a1": None, "a2": None, "fechado": None},
        "saidas_parciais": [],
        "resultado_R": None,
        "resultado_pct": None,
        "status": "ABERTO",
    })

    enviar_telegram(gerar_mensagem_entrada(sig, preco_atual), modo_sombra)
    logging.info(f"[{symbol}] novo sinal setup {sig.setup} {sig.lado} rr_alvo2={sig.rr[1]:.2f}")


def fechar_posicao(symbol, pos, registro, preco_saida, motivo, modo_sombra):
    pct_executado = sum(s["pct"] for s in pos["saidas"])
    pct_restante = 100 - pct_executado
    if pct_restante > 0:
        saida = {"pct": pct_restante, "preco": preco_saida, "motivo": motivo}
        pos["saidas"].append(saida)
        if registro is not None:
            registro["saidas_parciais"].append(saida)

    entrada = pos["entrada"]
    stop_inicial = pos["stop_inicial"]
    sinal = 1 if pos["lado"] == "LONG" else -1
    risco_inicial = abs(entrada - stop_inicial)

    def para_r(preco):
        return sinal * (preco - entrada) / risco_inicial if risco_inicial else 0.0

    resultado_r = sum((s["pct"] / 100.0) * para_r(s["preco"]) for s in pos["saidas"])
    resultado_pct = sum(
        (s["pct"] / 100.0) * sinal * (s["preco"] - entrada) / entrada * 100 for s in pos["saidas"]
    )

    if registro is not None:
        registro["status"] = "FECHADO"
        registro["timestamps"]["fechado"] = datetime.now(timezone.utc).isoformat()
        registro["resultado_R"] = resultado_r
        registro["resultado_pct"] = resultado_pct

    pos["_fechada"] = True
    if motivo == "stop":
        enviar_telegram(msg_stop(symbol, preco_saida), modo_sombra)
    else:
        enviar_telegram(msg_estrutura(symbol, preco_saida), modo_sombra)
    logging.info(f"[{symbol}] posição fechada ({motivo}) resultado_R={resultado_r:.2f}")


def manage_position(symbol, pos, preco_atual, d1_closed, h4_closed, resultados, modo_sombra):
    lado = pos["lado"]
    registro = find_resultado(resultados, pos["trade_id"])

    stop = pos["stop_atual"]
    stop_atingido = preco_atual <= stop if lado == "LONG" else preco_atual >= stop
    if stop_atingido:
        fechar_posicao(symbol, pos, registro, preco_atual, "stop", modo_sombra)
        return

    a1, a2, _a3 = pos["alvos"]
    if not pos["parciais"]["a1"]:
        atingiu = preco_atual >= a1 if lado == "LONG" else preco_atual <= a1
        if atingiu:
            pos["parciais"]["a1"] = True
            pos["stop_atual"] = pos["entrada"]
            saida = {"pct": CFG["PARCIAL_1_PCT"], "preco": preco_atual, "motivo": "alvo1"}
            pos["saidas"].append(saida)
            if registro is not None:
                registro["timestamps"]["a1"] = datetime.now(timezone.utc).isoformat()
                registro["saidas_parciais"].append(saida)
            enviar_telegram(msg_parcial(symbol, CFG["PARCIAL_1_PCT"], preco_atual, "alvo 1 atingido"), modo_sombra)
            enviar_telegram(msg_breakeven(symbol), modo_sombra)
            return
    elif not pos["parciais"]["a2"]:
        atingiu2 = preco_atual >= a2 if lado == "LONG" else preco_atual <= a2
        if atingiu2:
            pos["parciais"]["a2"] = True
            saida = {"pct": CFG["PARCIAL_2_PCT"], "preco": preco_atual, "motivo": "alvo2"}
            pos["saidas"].append(saida)
            if registro is not None:
                registro["timestamps"]["a2"] = datetime.now(timezone.utc).isoformat()
                registro["saidas_parciais"].append(saida)
            enviar_telegram(msg_parcial(symbol, CFG["PARCIAL_2_PCT"], preco_atual, "alvo 2 atingido"), modo_sombra)
            return
    else:
        ph4, pl4 = pivots(h4_closed)
        if lado == "LONG":
            candidatos = pl4.dropna()
            if not candidatos.empty:
                novo_stop = float(candidatos.iloc[-1])
                if novo_stop > pos["stop_atual"]:
                    pos["stop_atual"] = novo_stop
        else:
            candidatos = ph4.dropna()
            if not candidatos.empty:
                novo_stop = float(candidatos.iloc[-1])
                if novo_stop < pos["stop_atual"]:
                    pos["stop_atual"] = novo_stop

    if len(d1_closed) > 0:
        estrutura_ref = pos["estrutura_ref"]
        ultimo_close_d1 = d1_closed["close"].iloc[-1]
        perda_estrutura = ultimo_close_d1 < estrutura_ref if lado == "LONG" else ultimo_close_d1 > estrutura_ref
        if perda_estrutura:
            fechar_posicao(symbol, pos, registro, preco_atual, "estrutura", modo_sombra)


# --------------------------------------------------------------------------
# Ciclo principal
# --------------------------------------------------------------------------

def process_symbol(exchange, symbol, btc_d1_closed, estado, resultados, modo_sombra):
    try:
        d1_full = fetch_ohlcv_df(exchange, symbol, CFG["TIMEFRAME_D1"], CFG["CANDLES_D1"])
        h4_full = fetch_ohlcv_df(exchange, symbol, CFG["TIMEFRAME_H4"], CFG["CANDLES_H4"])
    except Exception as e:
        logging.error(f"[{symbol}] falha ao buscar candles: {e}")
        return

    if len(d1_full) < 2 or len(h4_full) < 2:
        logging.warning(f"[{symbol}] dados insuficientes")
        return

    d1 = d1_full.iloc[:-1]
    h4_closed = h4_full.iloc[:-1]
    preco_atual = float(h4_full["close"].iloc[-1])

    pos = estado["posicoes"].get(symbol)
    if pos is not None:
        manage_position(symbol, pos, preco_atual, d1, h4_closed, resultados, modo_sombra)
        if pos.get("_fechada"):
            del estado["posicoes"][symbol]
        return

    ultimo_4h_ts = h4_closed.index[-1].isoformat()
    if estado["ultimo_4h_fechado"].get(symbol) == ultimo_4h_ts:
        return
    estado["ultimo_4h_fechado"][symbol] = ultimo_4h_ts

    if len(d1) < CFG["EMA_SLOW"] + 10 or len(h4_closed) < 30:
        return

    candidatos = []

    try:
        s = setup_a(symbol, d1, h4_closed)
        if s:
            candidatos.append(s)
    except Exception as e:
        logging.error(f"[{symbol}] erro no setup A (long): {e}\n{traceback.format_exc()}")

    try:
        s = setup_b(symbol, d1, h4_closed)
        if s:
            candidatos.append(s)
    except Exception as e:
        logging.error(f"[{symbol}] erro no setup B (long): {e}\n{traceback.format_exc()}")

    try:
        if short_gating_ok(d1, btc_d1_closed):
            d1_espelhado = mirror_df(d1)
            h4_espelhado = mirror_df(h4_closed)
            sa = setup_a(symbol, d1_espelhado, h4_espelhado)
            if sa:
                candidatos.append(mirror_signal(sa))
            sb = setup_b(symbol, d1_espelhado, h4_espelhado)
            if sb:
                candidatos.append(mirror_signal(sb))
    except Exception as e:
        logging.error(f"[{symbol}] erro nos setups de short: {e}\n{traceback.format_exc()}")

    if not candidatos:
        return

    melhor = max(candidatos, key=lambda s: s.rr[1])
    abrir_posicao(symbol, melhor, preco_atual, estado, resultados, modo_sombra)


def modo_sombra_ativo():
    valor = os.environ.get(CFG["MODO_SOMBRA_ENV"], str(CFG["MODO_SOMBRA_DEFAULT"]))
    return valor.strip().lower() not in ("false", "0", "no", "nao", "não")


def ciclo():
    modo_sombra = modo_sombra_ativo()
    estado = load_estado()
    resultados = load_resultados()
    exchange = build_exchange()

    btc_d1_closed = None
    try:
        btc_d1_full = fetch_ohlcv_df(exchange, "BTC/USDT", CFG["TIMEFRAME_D1"], CFG["CANDLES_D1"])
        btc_d1_closed = btc_d1_full.iloc[:-1]
    except Exception as e:
        logging.error(f"falha ao buscar BTC/USDT D1, shorts desabilitados neste ciclo: {e}")

    for symbol in CFG["SYMBOLS"]:
        try:
            process_symbol(exchange, symbol, btc_d1_closed, estado, resultados, modo_sombra)
        except Exception as e:
            logging.error(f"[{symbol}] erro inesperado no ciclo: {e}\n{traceback.format_exc()}")

    save_estado(estado)
    save_resultados(resultados)


def main():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        stream=sys.stdout,
    )
    logging.info("SPO Bot V5 iniciado")
    while True:
        inicio = time.time()
        try:
            ciclo()
        except Exception as e:
            logging.error(f"erro fatal no ciclo: {e}\n{traceback.format_exc()}")
        decorrido = time.time() - inicio
        time.sleep(max(1.0, CFG["LOOP_INTERVAL_SEC"] - decorrido))


if __name__ == "__main__":
    main()
