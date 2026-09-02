// Pyodide 執行器:在瀏覽器中安全執行使用者的 Python 程式碼並跑測試

let pyodide = null;

const HARNESS = `
import io, sys, json, traceback

def _pyquest_friendly_error(exc):
    """把例外轉成適合初學者的訊息,並標出行號。"""
    lineno = None
    for frame in traceback.extract_tb(exc.__traceback__):
        if frame.filename == "<string>":
            lineno = frame.lineno
    name = type(exc).__name__
    detail = str(exc)
    tips = {
        "SyntaxError": "語法錯誤:檢查冒號、引號、括號有沒有成對",
        "IndentationError": "縮排錯誤:檢查每一行前面的空格",
        "NameError": "找不到這個名字:變數或函式可能拼錯或還沒定義",
        "TypeError": "型別錯誤:檢查是不是把字串和數字混在一起運算了",
        "ZeroDivisionError": "除以零了!分母不能是 0",
        "IndexError": "索引超出範圍:清單沒有那麼多項目",
        "KeyError": "字典裡沒有這個鍵",
    }
    tip = tips.get(name, "")
    loc = f"(第 {lineno} 行)" if lineno else ""
    msg = f"{name}{loc}: {detail}"
    if tip:
        msg += f"\\n💡 {tip}"
    return msg

def _pyquest_run(code, tests_json, stdin_json="[]"):
    ns = {}
    # 模擬鍵盤輸入:input() 會依序取出預先提供的字串,並回顯在輸出中
    stdin_lines = list(json.loads(stdin_json))

    def _fake_input(prompt=""):
        print(prompt, end="")
        value = stdin_lines.pop(0) if stdin_lines else ""
        print(value)
        return value

    ns["input"] = _fake_input
    buf = io.StringIO()
    old_stdout = sys.stdout
    sys.stdout = buf
    error = None
    try:
        exec(code, ns)
    except SyntaxError as e:
        error = f"SyntaxError(第 {e.lineno} 行): {e.msg}\\n💡 語法錯誤:檢查冒號、引號、括號有沒有成對"
    except Exception as e:
        error = _pyquest_friendly_error(e)
    finally:
        sys.stdout = old_stdout
    output = buf.getvalue()

    results = []
    if error is None:
        for t in json.loads(tests_json):
            env = dict(ns)
            env["ns"] = ns
            env["output"] = output
            env["src"] = code
            try:
                exec(t["code"], env)
                results.append({"name": t["name"], "passed": True, "message": ""})
            except AssertionError as e:
                results.append({"name": t["name"], "passed": False, "message": str(e) or "測試沒通過"})
            except Exception as e:
                results.append({
                    "name": t["name"],
                    "passed": False,
                    "message": f"執行測試時出錯 {type(e).__name__}: {e}",
                })
    return json.dumps({"output": output, "error": error, "results": results}, ensure_ascii=False)
`;

export async function initRunner() {
  pyodide = await loadPyodide();
  await pyodide.runPythonAsync(HARNESS);
}

export function isReady() {
  return pyodide !== null;
}

/**
 * 執行使用者程式碼並跑該關卡的測試。
 * @returns {{output: string, error: string|null, results: Array<{name, passed, message}>}}
 */
export async function runCode(code, tests, stdin = []) {
  if (!pyodide) {
    throw new Error("Python 引擎尚未就緒");
  }
  const runFn = pyodide.globals.get("_pyquest_run");
  try {
    const resultJson = runFn(code, JSON.stringify(tests), JSON.stringify(stdin));
    return JSON.parse(resultJson);
  } finally {
    runFn.destroy();
  }
}
