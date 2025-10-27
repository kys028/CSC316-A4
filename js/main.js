(async function () {
    const csvUrl = "data/weekly_gas_prices.csv";

    let raw = await d3.csv(csvUrl, d => ({
        date: new Date(d.date),
        fuel: d.fuel,
        grade: d.grade,
        formulation: d.formulation,
        price: +d.price
    }));

    const grouped = d3.group(raw, d => `${d.fuel}|${d.grade}|${d.formulation}`);
    const typeKeys = Array.from(grouped.keys());
    const selectedTypes = d3.shuffle(typeKeys).slice(0, 12);

    const sampled = [];
    selectedTypes.forEach(typeKey => {
        const entries = grouped.get(typeKey);
        const step = Math.max(1, Math.floor(entries.length / 8));
        for (let i = 0; i < entries.length; i += step) sampled.push(entries[i]);
    });

    raw = sampled;
    document.getElementById("dataInfo").textContent =
        `Showing ${sampled.length} data points from ${selectedTypes.length} fuel type combinations (sampled from 22,360 total rows)`;

    // SVG setup
    const svg = d3.select("#chart");
    const W = 1100, H = 620, margin = {top: 20, right: 20, bottom: 44, left: 70};
    const innerW = W - margin.left - margin.right;
    const innerH = H - margin.top - margin.bottom;
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    g.append("rect")
        .attr("x", 0).attr("y", 0)
        .attr("width", innerW).attr("height", innerH)
        .attr("fill", "none").attr("stroke", "#243040").attr("rx", 14);

    const priceExtent = d3.extent(raw, d => d.price);
    const y = d3.scaleLinear().domain(priceExtent).range([innerH - 12, 12]).nice();
    const yAxis = d3.axisLeft(y).ticks(10, "~f");
    g.append("g").attr("class", "y axis").call(yAxis);
    g.append("text")
        .attr("x", -margin.left + 10).attr("y", 12).attr("fill", "#a9b8cc")
        .attr("font-size", 12).text("Price (USD/gal)");

    const fuelCats = ["gasoline", "diesel"];
    const x = d3.scalePoint().domain(fuelCats).range([120, innerW - 120]).padding(0.6);
    const r = d3.scaleSqrt().domain(priceExtent).range([8, 28]);
    const color = d3.scaleOrdinal().domain(fuelCats).range(["#6fa8ff", "#ffd166"]);

    const defs = svg.append("defs");
    const grad = defs.append("radialGradient").attr("id", "balloonGlow").attr("cx", "35%").attr("cy", "30%");
    grad.append("stop").attr("offset", "0%").attr("stop-color", "white").attr("stop-opacity", 0.7);
    grad.append("stop").attr("offset", "60%").attr("stop-color", "white").attr("stop-opacity", 0.15);
    grad.append("stop").attr("offset", "100%").attr("stop-color", "white").attr("stop-opacity", 0);

    g.selectAll(".fuelLabel").data(fuelCats).enter().append("text")
        .attr("class", "fuelLabel").attr("x", d => x(d)).attr("y", innerH + 26).text(d => d);

    const tip = d3.select("#tip");
    const fmt = d3.format(".3f");

    function boundForce(x0, y0, w, h, pad = 2) {
        return function () {
            for (const d of sim.nodes()) {
                d.x = Math.max(x0 + pad + d.r, Math.min(x0 + w - pad - d.r, d.x));
                d.y = Math.max(y0 + pad + d.r, Math.min(y0 + h - pad - d.r, d.y));
            }
        };
    }

    let sim;

    function render(data) {
        const nodes = data.map(d => ({
            ...d,
            targetX: x(d.fuel),
            targetY: y(d.price),
            r: r(d.price)
        }));

        const sel = g.selectAll(".balloonGroup").data(nodes, d => d.date + d.fuel + d.grade + d.formulation);
        sel.exit().remove();

        const enter = sel.enter().append("g").attr("class", "balloonGroup balloon").call(drag(sim));

        enter.append("line")
            .attr("class", "string").attr("x1", 0).attr("y1", 0)
            .attr("x2", 0).attr("y2", d => d.r + 22)
            .attr("stroke", "#415974").attr("stroke-width", 1.2).attr("opacity", .8);

        enter.append("circle")
            .attr("class", "balloonBody").attr("r", d => d.r)
            .attr("fill", d => color(d.fuel))
            .attr("fill-opacity", 0.9)
            .attr("stroke", "#0b0f14").attr("stroke-width", 0.6);

        enter.append("circle")
            .attr("r", d => d.r)
            .attr("fill", "url(#balloonGlow)")
            .attr("pointer-events", "none");

        enter.append("path")
            .attr("d", d => `M ${-2} ${d.r-1} L 0 ${d.r+4} L 2 ${d.r-1} Z`)
            .attr("fill", "#1b2635").attr("opacity", .8);

        enter.on("mousemove", (e, d) => {
            tip.style("left", e.pageX + "px").style("top", (e.pageY - 18) + "px")
                .style("opacity", 1)
                .html(`<strong>${d.fuel}</strong>, ${d.grade}${d.formulation ? " · " + d.formulation : ""}<br>
                ${d.date.toISOString().slice(0,10)}<br>
                Price: $${fmt(d.price)}/gal`);
        }).on("mouseleave", () => tip.style("opacity", 0));

        const merged = enter.merge(sel);

        if (sim) sim.stop();
        sim = d3.forceSimulation(nodes)
            .force("x", d3.forceX(d => d.targetX).strength(0.15))
            .force("y", d3.forceY(d => d.targetY).strength(0.2))
            .force("collide", d3.forceCollide(d => d.r + 1.5))
            .alphaDecay(0.04)
            .on("tick", () => merged.attr("transform", d => `translate(${d.x},${d.y})`));

        sim.force("bounds", boundForce(0, 0, innerW, innerH, 6));
    }

    function drag(sim) {
        function dragstarted(event, d) {
            if (!event.active) sim.alphaTarget(0.2).restart();
            d.fx = d.x; d.fy = d.y;
        }
        function dragged(event, d) {
            d.fx = event.x; d.fy = event.y;
        }
        function dragended(event, d) {
            if (!event.active) sim.alphaTarget(0);
            d.fx = null; d.fy = null;
        }
        return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
    }

    const gradeSelect = document.getElementById("gradeSelect");
    const formulationSelect = document.getElementById("formulationSelect");

    function applyFilter() {
        const [gasGood, dieselGood] = gradeSelect.value.split("|");
        const form = formulationSelect.value;

        const filtered = raw.filter(d => {
            const gasOK   = d.fuel === "gasoline" && (gasGood === "all" || d.grade === gasGood);
            const diesOK  = d.fuel === "diesel"   && (dieselGood === "all" || d.grade === dieselGood);
            const gradeOK = (gasOK || diesOK) || (gasGood === "all" && dieselGood === "all");
            const formOK = (form === "any") || (d.formulation || "all") === form;
            return gradeOK && formOK && !isNaN(d.price);
        });

        render(filtered);
    }

    gradeSelect.addEventListener("change", applyFilter);
    formulationSelect.addEventListener("change", applyFilter);
    applyFilter();
})();

// test