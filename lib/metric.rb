class Metric
  include Redised

  def self.all(start=0, max = 100)
    return redis.lrange "metrics", 0, max-1
  end
  
  def self.refresh()
    metrics = get_metrics_list
    redis.del "metrics"
    puts "Caching #{metrics.length} metrics into redis"
    
    if use_index_by_keywords
      search_hash = {}
      metrics.each do |metric|
        split_into_keywords(metric).each do |path_keyword|
          (search_hash[path_keyword] ||= []) << metric
        end
      end
      
      puts "Indexing metrics by #{search_hash.length} unique keywords"
      redis.pipelined do
        search_hash.each_pair do |search_key, metric_matches|
          redis.del "metrics:#{search_key}"
          metric_matches.each do |metric|
            redis.rpush "metrics:#{search_key}", metric
          end
        end
      end
  end
    
    redis.pipelined do
      redis.del "metrics"
      metrics.each{ |metric| redis.rpush "metrics", metric }
    end
    
    metrics
  end

  def self.find_keywords(match, max=100)
    return [] if !use_index_by_keywords

    match = match.strip
    keywords = redis.keys("metrics:*#{match}*")
    keywords = keywords.map { |key| key.gsub("metrics:", "") }
    keywords = keywords.sort[0, max]
  end

  def self.find(match, max = 100)
    match = match.to_s.strip
    
    if use_index_by_keywords
      return find_by_keywords(match, max)
    end
    find_in_big_list(match, max)
  end

  private
  
  def self.use_index_by_keywords()
    Graphiti.settings.respond_to?(:index_by_keywords) ? Graphiti.settings.index_by_keywords : false
  end
  
  def self.find_in_big_list(match, max = 100)
    matches = []
    start = 0
    batch = []
    batch_size = max * 10
    begin
      batch = all(start, batch_size)
      batch.each do |m|
        if m =~ /#{match}/i
          matches << m
        end
        break if matches.length >= max
      end
      start = start + batch_size
    end while not batch.empty? and matches.length < max
    matches
  end
  
  def self.find_by_keywords(match, max = 100)
    keywords = match.split(/[ \.,]/).uniq()
    if keywords.length == 0
      matches = all(0, max)
    elsif keywords.length == 1
      matches = find_by_keyword(keywords[0], max)
    else
      batch_size = 10 * max
      begin
        matches_by_keyword = []
        keywords.each do |keyword|
          matches_by_keyword.push find_by_keyword(keyword, batch_size)
        end
        smallest_match = matches_by_keyword.inject() do |smallest, matchset|
          smallest.length <= matchset.length ? smallest : matchset
        end
        
        if smallest_match.length < batch_size
          matches = filter(smallest_match, keywords)[0, max]
          break
        else
          matches = matches_by_keyword.reduce(:&)
        end
        
        batch_size = batch_size * 10
      end while matches.length < max
    end
    matches[0, max]
  end
  
  def self.filter(candidates, keywords)
    matches = []
    candidates.each do |candidate|
      if keywords & split_into_keywords(candidate) == keywords
        matches << candidate
      end
    end
    matches
  end
  
  def self.split_into_keywords(metric)
    metric.split(".").uniq()
  end
  
  def self.find_by_keyword(keyword, max = 1000, start = 0)
    redis.lrange "metrics:#{keyword}", start, max-1
  end
  
  def self.get_metrics_list(prefix = Graphiti.settings.metric_prefix)
    url = "#{Graphiti.settings.graphite_base_url}/metrics/index.json"
    puts "Getting #{url}"
    response = Typhoeus::Request.get(url)
    if response.success?
      json = Yajl::Parser.parse(response.body)
      if prefix.nil?
        metrics = json 
      elsif prefix.kind_of?(Array)
        metrics = json.grep(/^[#{prefix.map! { |k| Regexp.escape k }.join("|")}]/)
      else
        metrics = json.grep(/^#{Regexp.escape prefix}/)
      end
    else
      puts "Error fetching #{url}. #{response.inspect}"
    end
    metrics.sort
  end

end
