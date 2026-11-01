# CEDA price files

Put CSV files downloaded from **CEDA Agri Market Data** (Centre for Economic Data and Analysis, Ashoka University; source: Agmarknet) in this folder:

<https://agmarknet.ceda.ashoka.edu.in>

1. Sign in (free), choose **Wheat** or **Soybean**, the state (for example Madhya Pradesh), the mandi, monthly frequency and the full date range from 2000.
2. Download the CSV and save it here. Including the commodity in the file name (for example `wheat_indore.csv`) helps when the file has no commodity column.
3. Stop the dev server if you use the embedded local database, then run:

```bash
npm run import:ceda
```

Options: `npm run import:ceda -- --commodity Wheat --mandi Indore` sets the commodity and mandi when the CSV lacks those columns.

The importer reads files up to 50 MB as a stream. It recognises columns by name: a date or month column (or separate year and month), state, district, market / mandi / APMC, commodity, modal price, min price, max price and arrivals / quantity. Prices are Rs per quintal. Daily rows are reduced to the monthly median modal price.

CSV files here are ignored by git.
