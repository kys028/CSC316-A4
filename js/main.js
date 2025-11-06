const margin = {top: 40, right: 20, bottom: 50, left: 70},
    width  = 900 - margin.left - margin.right,
    height = 450 - margin.top - margin.bottom;

const svg = d3.select("#heatmap")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

const tooltip = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

d3.csv("data/weekly_gas_prices.csv", d3.autoType).then(data => {
    data.forEach(d => {
        d.date = new Date(d.date);
        d.year = d.date.getFullYear();
        d.week = +d3.timeFormat("%U")(d.date);
    });

    const fuels  = Array.from(new Set(data.map(d => d.fuel))).sort();
    const grades = Array.from(new Set(data.map(d => d.grade))).sort();
    const years  = Array.from(new Set(data.map(d => d.year))).sort((a,b)=>a-b);

    d3.select("#fuelSelect")
        .selectAll("option")
        .data(fuels)
        .join("option")
        .attr("value", d => d)
        .text(d => d);

    d3.select("#gradeSelect")
        .selectAll("option")
        .data(grades)
        .join("option")
        .attr("value", d => d)
        .text(d => d);

    let currentFuel = fuels[0],
        currentGrade = grades[0],
        currentYear = 2025;

    const x = d3.scaleBand().domain(d3.range(1,53)).range([0, width]).padding(0.05);
    const y = d3.scaleBand().domain(years).range([0, height]).padding(0.05);
    const color = d3.scaleSequential(d3.interpolateYlOrRd);

    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).tickValues([1,13,26,39,52]));
    svg.append("g").call(d3.axisLeft(y).tickValues(years.filter(y=>y%5===0)));

    // X-axis label
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", height + 40)
        .attr("text-anchor", "middle")
        .attr("fill", "#333")
        .attr("font-weight", "600")
        .text("Week of Year");

    // Y-axis (show all years)
    svg.append("g").call(d3.axisLeft(y));

    // Y-axis label
    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -50)
        .attr("text-anchor", "middle")
        .attr("fill", "#333")
        .attr("font-weight", "600")
        .text("Year");



    // Draw Heatmap
    function updateHeatmap() {
        const subset = data.filter(d =>
            d.fuel === currentFuel &&
            d.grade === currentGrade &&
            d.year <= currentYear
        );

        color.domain(d3.extent(subset, d => d.price));

        const rects = svg.selectAll("rect")
            .data(subset, d => `${d.year}-${d.week}`);


        rects.join(
            enter => enter.append("rect")
                .attr("x", d => x(d.week))
                .attr("y", d => y(d.year))
                .attr("width", x.bandwidth())
                .attr("height", y.bandwidth())
                .attr("fill", d => color(d.price))
                .attr("opacity", 0)
                .on("mouseover", (event, d) => {
                    tooltip.transition().duration(150).style("opacity", 0.9);
                    tooltip.html(`Year ${d.year}<br>Week ${d.week}<br>Price $${d.price.toFixed(2)}`)
                        .style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY - 28) + "px");
                })
                .on("mouseout", () => tooltip.transition().duration(200).style("opacity", 0))
                .on("click", (_, d) => {
                    drawLineChart(d.year);
                    document.querySelector("#linechart").scrollIntoView({ behavior: "smooth", block: "start" });
                })
                .transition()
                .duration(800)
                .attr("opacity", 1),
            update => update.transition().duration(700)
                .attr("fill", d => color(d.price)),
            exit => exit.transition().duration(300).attr("opacity", 0).remove()
        );

        drawLegend();
    }





    // Legend
    function drawLegend() {
        const legendSvg = d3.select("#legend").html("").append("svg")
            .attr("width", 280)
            .attr("height", 40);
        const defs = legendSvg.append("defs");
        const grad = defs.append("linearGradient").attr("id", "grad");
        grad.selectAll("stop")
            .data(d3.ticks(0,1,10))
            .join("stop")
            .attr("offset", d => d)
            .attr("stop-color", d => color(color.domain()[0] + d * (color.domain()[1]-color.domain()[0])));

        legendSvg.append("rect")
            .attr("width", 200).attr("height", 15)
            .attr("x", 10).attr("y", 10)
            .style("fill", "url(#grad)");

        const scale = d3.scaleLinear().domain(color.domain()).range([10,210]);
        legendSvg.append("g")
            .attr("transform", "translate(0,28)")
            .call(d3.axisBottom(scale).ticks(5).tickSize(0));
    }




    // Line Chart
    function drawLineChart(selectedYear) {
        const subset = data.filter(d =>
            d.fuel === currentFuel &&
            (currentGrade === "all" || d.grade === currentGrade) &&
            d.year === selectedYear
        );

        const weekAgg = Array.from(
            d3.rollup(
                subset,
                v => d3.mean(v, d => d.price),
                d => d3.timeWeek.floor(d.date)
            ),
            ([date, avgPrice]) => ({ date, price: avgPrice })
        ).sort((a, b) => d3.ascending(a.date, b.date));

        // Clear and setup new chart
        d3.select("#linechart").html("");
        const svgL = d3.select("#linechart")
            .append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", 300)
            .append("g")
            .attr("transform", `translate(${margin.left},50)`);

        let xL = d3.scaleTime()
            .domain(d3.extent(weekAgg, d => d.date))
            .range([0, width]);
        let yL = d3.scaleLinear()
            .domain(d3.extent(weekAgg, d => d.price)).nice()
            .range([200, 0]);

        const xAxis = svgL.append("g")
            .attr("transform", `translate(0,200)`)
            .call(d3.axisBottom(xL).ticks(6));
        const yAxis = svgL.append("g").call(d3.axisLeft(yL));

        svgL.append("text")
            .attr("x", width / 2)
            .attr("y", 240)
            .attr("text-anchor", "middle")
            .attr("fill", "#333")
            .attr("font-weight", "600")
            .text("Date");

        svgL.append("text")
            .attr("transform", "rotate(-90)")
            .attr("x", -100)
            .attr("y", -50)
            .attr("text-anchor", "middle")
            .attr("fill", "#333")
            .attr("font-weight", "600")
            .text("Price ($)");

        const line = d3.line()
            .x(d => xL(d.date))
            .y(d => yL(d.price));

        // main price line
        const path = svgL.append("path")
            .datum(weekAgg)
            .attr("fill", "none")
            .attr("stroke", "#007acc")
            .attr("stroke-width", 2)
            .attr("d", line);

        const movingAvg = weekAgg.map((d, i, arr) => {
            const window = arr.slice(Math.max(0, i - 3), i + 1);
            return {
                date: d.date,
                price: d3.mean(window, v => v.price)
            };
        });
        svgL.append("path")
            .datum(movingAvg)
            .attr("fill", "none")
            .attr("stroke", "#ff8800")
            .attr("stroke-width", 1.8)
            .attr("stroke-dasharray", "5 3")
            .attr("opacity", 0.9)
            .attr("d", line);

//Summary statistics text
        const avg = d3.mean(weekAgg, d => d.price);
        const change = weekAgg.length > 1
            ? weekAgg[weekAgg.length - 1].price - weekAgg[0].price
            : 0;
        const vol = d3.deviation(weekAgg, d => d.price);

        d3.select("#linechart")
            .append("div")
            .attr("class", "summary")
            .html(
                `<b>${selectedYear}</b> — 
       Avg: <span style="color:#007acc">$${avg.toFixed(2)}</span>,
       Change: <span style="color:${change>=0?"#28a745":"#dc3545"}">
       ${change>=0?"+":""}${change.toFixed(2)}</span>,
       Volatility: <span style="color:#ff8800">${vol.toFixed(2)}</span>`
            )
            .style("font-family", "Inter, sans-serif")
            .style("margin-top", "4px")
            .style("text-align", "center")
            .style("font-size", "0.9rem")
            .style("color", "var(--text)");

        const totalLength = path.node().getTotalLength();
        path.attr("stroke-dasharray", totalLength + " " + totalLength)
            .attr("stroke-dashoffset", totalLength)
            .transition()
            .duration(1200)
            .ease(d3.easeLinear)
            .attr("stroke-dashoffset", 0);

        svgL.selectAll("circle")
            .data(weekAgg)
            .join("circle")
            .attr("cx", d => xL(d.date))
            .attr("cy", d => yL(d.price))
            .attr("r", 3)
            .attr("fill", "#ff6b00")
            .on("mouseover", (event, d) => {
                tooltip.transition().duration(200).style("opacity", 1);
                tooltip.html(`${d3.timeFormat("%b %d")(d.date)}<br>$${d.price.toFixed(2)}`)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 28) + "px");
            })
            .on("mouseout", () => tooltip.transition().duration(200).style("opacity", 0));

        //zooming brush
        const brush = d3.brushX()
            .extent([[0, 0], [width, 200]])
            .on("end", ({selection}) => {
                if (!selection) return;
                const [x0, x1] = selection.map(xL.invert);
                zoomToPeriod(x0, x1);
                svgL.select(".brush").call(brush.move, null); // clear brush
            });

        svgL.append("g").attr("class", "brush").call(brush);

        function zoomToPeriod(start, end) {
            const filtered = weekAgg.filter(d => d.date >= start && d.date <= end);
            xL.domain([start, end]);
            yL.domain(d3.extent(filtered, d => d.price)).nice();

            // Update axes
            xAxis.transition().duration(800).call(d3.axisBottom(xL).ticks(6));
            yAxis.transition().duration(800).call(d3.axisLeft(yL));

            // Update line
            path.datum(filtered)
                .transition()
                .duration(800)
                .attr("d", line);

            // Update circles
            svgL.selectAll("circle")
                .data(filtered, d => d.date)
                .join("circle")
                .transition()
                .duration(800)
                .attr("cx", d => xL(d.date))
                .attr("cy", d => yL(d.price));
        }
        function resetZoom() {
            xL.domain(d3.extent(weekAgg, d => d.date));
            yL.domain(d3.extent(weekAgg, d => d.price)).nice();

            xAxis.transition().duration(800).call(d3.axisBottom(xL).ticks(6));
            yAxis.transition().duration(800).call(d3.axisLeft(yL));

            path.datum(weekAgg)
                .transition().duration(800)
                .attr("d", line);

            svgL.selectAll("circle")
                .data(weekAgg, d => d.date)
                .join("circle")
                .transition()
                .duration(800)
                .attr("cx", d => xL(d.date))
                .attr("cy", d => yL(d.price));
        }

        // Double-click reset
        svgL.on("dblclick", resetZoom);
        d3.select("#zoomResetBtn").on("click", resetZoom);
    }




    // Listeners
    d3.select("#fuelSelect").on("change", e => {
        currentFuel = e.target.value;
        updateHeatmap();
    });

    d3.select("#gradeSelect").on("change", e => {
        currentGrade = e.target.value;
        updateHeatmap();
    });

    d3.select("#yearSlider").on("input", e => {
        currentYear = +e.target.value;
        d3.select("#yearLabel").text(`Up to ${currentYear}`);
        updateHeatmap();
    });

    d3.select("#resetBtn").on("click", () => {
        currentFuel = fuels[0];
        currentGrade = grades[0];
        currentYear = 2025;
        d3.select("#fuelSelect").property("value", currentFuel);
        d3.select("#gradeSelect").property("value", currentGrade);
        d3.select("#yearSlider").property("value", 2025);
        d3.select("#yearLabel").text("Up to 2025");
        updateHeatmap();
        d3.select("#linechart").html("");
    });

    updateHeatmap();



// Play Animation Button
    d3.select("#playBtn").on("click", () => {
        let yearList = Array.from(new Set(data.map(d => d.year))).sort((a, b) => a - b);
        let i = 0;
        const playInterval = setInterval(() => {
            if (i >= yearList.length) {
                clearInterval(playInterval);
                return;
            }
            currentYear = yearList[i];
            d3.select("#yearSlider").property("value", currentYear);
            d3.select("#yearLabel").text(`Up to ${currentYear}`);
            updateHeatmap();

            i++;
        }, 300);
    });



    // dark light mode exchange
    const themeBtn = document.getElementById("themeToggle");
    themeBtn.addEventListener("click", () => {
        document.body.classList.toggle("dark");
        const isDark = document.body.classList.contains("dark");
        themeBtn.textContent = isDark ? "️ Light Mode "  : " Dark Mode ";
    });

//STORY MODE:

    d3.select("#storyBtn").on("click", async () => {
        const keyEvents = [
            {year: 2008, note: "Global Financial Crisis — oil price spike"},
            {year: 2020, note: "COVID-19 Pandemic — demand collapse"},
            {year: 2022, note: "Post-pandemic rebound & inflation pressures"}
        ];

        for (const ev of keyEvents) {
            currentYear = ev.year;
            d3.select("#yearSlider").property("value", currentYear);
            d3.select("#yearLabel").text(`Up to ${currentYear}`);

            updateHeatmap();
            drawLineChart(ev.year);

            await new Promise(r => setTimeout(r, 600));

            document.querySelector("#linechart").scrollIntoView({
                behavior: "smooth",
                block: "start"
            });

            await new Promise(r => setTimeout(r, 600));
            const chartSvg = d3.select("#linechart svg");
            if (chartSvg.empty()) continue;

            const noteGroup = chartSvg.append("g")
                .attr("transform", `translate(${width - 320}, 20)`);

            noteGroup.append("rect")
                .attr("width", 300)
                .attr("height", 26)
                .attr("fill", "rgba(0,0,0,0.6)")
                .attr("rx", 6)
                .attr("opacity", 0)
                .transition().duration(300).attr("opacity", 1);

            noteGroup.append("text")
                .attr("x", 10).attr("y", 17)
                .attr("fill", "white")
                .attr("font-size", "13px")
                .attr("font-weight", "600")
                .attr("opacity", 0)
                .text(ev.note)
                .transition().duration(400).attr("opacity", 1);

            await new Promise(r => setTimeout(r, 3000));

            noteGroup.transition().duration(400).attr("opacity", 0).remove();
        }
    });

    d3.selectAll("#storyNav button").on("click", e => {
        const y = +e.target.dataset.year;
        currentYear = y;
        updateHeatmap(); drawLineChart(y);
        d3.select("#yearSlider").property("value", y);
    });

});
