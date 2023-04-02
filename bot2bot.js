const config = require('config');
const yargs = require('yargs/yargs');

const args = yargs(process.argv).argv;

const MODEL_ENDPOINTS = config.model_endpoints;
let ROUNDS = args.rounds ?? config.rounds;
const WAIT_TIME_S = args.waitTimeSeconds ?? config.wait_time_seconds;
const START_PROMPT = args.startPrompt ?? 'a prompt to start a hard science fiction story';
const CONT_PROMPT = args.nextPrompt ?? 'a follow-up paragraph to this hard science fiction story fragment';

async function promptAndWait (prompt, endpoint) {
  const promptRes = await fetch(endpoint, {
    method: 'POST',
    body: prompt
  });

  if (!promptRes.ok) {
    console.error(promptRes.status, promptRes.statusText, endpoint, prompt);
    throw new Error(`bad prompt: ${promptRes.statusText}`);
  }

  const promptId = (await promptRes.text()).trim();
  const getUrl = `${endpoint}/${promptId}`;
  console.log(`>>> Waiting on ${getUrl} ...`);

  let getStatus;
  let getResponse;
  do {
    const getRes = await fetch(getUrl);
    getStatus = getRes.status;
    if (getStatus === 200) {
      getResponse = await getRes.json();
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_TIME_S * 1000));
  } while (getStatus === 202);

  return getResponse;
}

function stringifyResponseMetrics (response) {
  return `>>> ${response.elapsed_ms} ms for ${response.tokens} tokens (${response.ms_per_token} ms/token)`;
}

async function main () {
  console.log(`>>> Start prompt: "${START_PROMPT}"`);
  console.log(`>>> Next prompt:  "${CONT_PROMPT}"`);
  console.log(`>>> Rounds:       ${ROUNDS}`);
  console.log(`>>> WaitTimeSecs: ${WAIT_TIME_S}`);

  const paras = [];
  let lastResp = await promptAndWait(START_PROMPT, MODEL_ENDPOINTS[0]);
  console.log(`Start response: ${lastResp.response}`);
  console.log(stringifyResponseMetrics(lastResp));
  paras.push(lastResp.response);
  let lastRespStr;
  let stuckCount = 0;
  for (let round = 0; round < ROUNDS; round++) {
    let curPrompt = lastResp.response;

    if (lastRespStr) {
      curPrompt = curPrompt.replace(lastRespStr, '').trim();
    }

    if (curPrompt.length === 0 || curPrompt.match(/^\s+$/)) {
      console.debug('STUCK', lastResp, lastRespStr);
      if (++stuckCount > 3) {
        console.error('Out of tries!');
        break;
      }

      console.log(`!!! Stuck! ${3 - stuckCount} retries left...`);
      ROUNDS++;
      curPrompt = lastResp.response;
    }

    const newPrompt = `${CONT_PROMPT}: "${curPrompt}"`;
    console.log(`Round ${round} prompt: ${newPrompt}`);
    lastRespStr = lastResp.response;
    lastResp = await promptAndWait(newPrompt, MODEL_ENDPOINTS[(round + 1) % MODEL_ENDPOINTS.length]);
    console.log(`Round ${round} response: ${lastResp.response}`);
    console.log(stringifyResponseMetrics(lastResp));
    paras.push(lastResp.response);
  }

  console.log('\n\n***** Rendered:\n\t' + paras.join('\n\t'));
}

main();
