import { registerNavigate }    from './navigate.js';
import { registerInput }       from './input.js';
import { registerScreenshot }  from './screenshot.js';
import { registerContent }     from './content.js';
import { registerEvaluate }    from './evaluate.js';
import { registerNetwork }     from './network.js';
import { registerConsole }     from './console.js';
import { registerEmulation }   from './emulation.js';
import { registerPerformance } from './performance.js';
import { registerMemory }      from './memory.js';

export function registerAllTools(server, ctx) {
  registerNavigate(server, ctx);    // navigate_page, new_page, list_pages, select_page, close_page, wait_for
  registerInput(server, ctx);       // click, hover, fill, fill_form, type_text, press_key, drag, handle_dialog, upload_file
  registerScreenshot(server, ctx);  // take_screenshot, take_snapshot
  registerContent(server, ctx);     // get_content, current_url
  registerEvaluate(server, ctx);    // evaluate_script
  registerNetwork(server, ctx);     // list_network_requests, get_network_request
  registerConsole(server, ctx);     // list_console_messages, get_console_message
  registerEmulation(server, ctx);   // emulate, resize_page
  registerPerformance(server, ctx); // performance_start_trace, performance_stop_trace, performance_analyze_insight
  registerMemory(server, ctx);      // take_memory_snapshot
}
