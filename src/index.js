const { ethers } = require("ethers");
const { readFileSync } = require("fs");
const axios = require("axios");

let config = {}

async function main() {
    loadConfig();
    const contracts = loadContracts();
    const scenario = loadScenario();

    if (scenario.steps.length === 0) {
        console.error("No steps to execute, exiting.");
        process.exit(1);
    }

    let fork = await startFork();

    for (let i in scenario.steps) {
        const step = scenario.steps[i];

        const { contract, method, params } = step;
        const { address, abi } = contracts[contract];

        const c = new ethers.Contract(address, abi);

        const tx = await c.populateTransaction[method](...params);

        await simulate(fork, {
            from: step.from,
            to: tx.to,
            input: tx.data,
            gas: step.gas || 100000,
            gas_price: step.gas_price || 10 ^ 9,
            value: step.value || 0,
        })

        console.log(`Transaction ${ i }: ${ viewSimulationEndpoint(fork) }`)
    }
}

function loadConfig() {
    config = JSON.parse(readFileSync("config.json"));
}

function loadContracts() {
    return JSON.parse(readFileSync("contracts/contracts.json"));
}

function loadScenario() {
    if (process.argv.length < 3) {
        console.error("missing path to scenario");
        process.exit(1);
    }

    const scenarioPath = process.argv[2];

    console.log("Loading scenario:", scenarioPath);

    return JSON.parse(readFileSync(scenarioPath));
}

async function startFork() {
    return axios.post(forkEndpoint(), {
        network_id: "1"
    }, {
        headers: {
            "X-Access-Key": config.key,
        }
    }).then(res => res.data.simulation_fork);
}

async function simulate(fork, tx) {
    let data = {
        from: tx.from,
        to: tx.to,
        input: tx.input,
        gas: tx.gas,
        gas_price: tx.gas_price.toString(),
        value: tx.value.toString(),
        save: true,
    };

    if (!!fork.head) {
        data["root"] = fork.head
    }

    return axios.post(forkEndpoint() + `/${ fork.id }/simulate`, data, {
        headers: {
            "X-Access-Key": config.key,
        }
    }).then(res => {
        fork.head = res.data.simulation.id;

        return res.data;
    }).catch(error => {
        throw error.response.data
    });
}

function forkEndpoint() {
    return `https://api.tenderly.co/api/v1/account/${ config.account }/project/${ config.project }/fork`;
}

function viewSimulationEndpoint(fork) {
    return `https://dashboard.tenderly.co/${ config.account }/${ config.project }/fork/${ fork.id }/simulation/${ fork.head }`
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });