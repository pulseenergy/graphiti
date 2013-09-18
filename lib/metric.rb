class Metric
  include Redised

  def self.all(start=0, max = 100)
    return redis.lrange "metrics", 0, max-1
  end
  
  def self.refresh()
    metrics = get_metrics_list
    redis.del "metrics"
    puts "Caching #{metrics.length} metrics into redis"

    redis.pipelined do
      metrics.each do |metric|
        prefix = ""
        keywords = metric.split(".")
        for i in 0..keywords.size()-2
          redis.sadd("metrics:folder:#{prefix}",keywords[i])
          if prefix != ""
            prefix << "."
          end
          prefix << keywords[i]
        end
        redis.sadd("metrics:key:#{prefix}", keywords[-1])
      end
    end
    
    metrics
  end

  def self.find_folders(match)
    redis.smembers("metrics:folder:#{match}").sort()
  end

  def self.find_metrics(match)
    redis.smembers("metrics:key:#{match}").sort()
  end

  def self.find_keywords(match, max=100)
    return [] if !use_index_by_keywords

    match = match.strip
    keywords = redis.keys("metrics:*#{match}*")
    keywords = keywords.map { |key| key.gsub("metrics:", "") }
    keywords = self.sort_prefer_prefix(keywords, match)[0, max]
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
    else
      keys = keywords.map { |keyword| "metrics:#{keyword}" }
      matches = redis.sinter *keys
    end
    matches = self.sort_prefer_prefix(matches, match)[0, max]
  end
  
  def self.sort_prefer_prefix(list, prefix)
    puts "sorting prefer #{prefix}"
    list.sort { |a,b| if a.start_with?(prefix) == b.start_with?(prefix) 
           then
             a <=> b
           elsif a.start_with?(prefix)
             -1
           else
            1
           end
       }
  end
  
  def self.split_into_keywords(metric)
    metric.split(".").uniq()
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
    metrics
  end

end
